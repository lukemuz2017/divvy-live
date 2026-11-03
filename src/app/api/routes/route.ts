import { auth } from '@clerk/nextjs/server';
import { createClient } from '@supabase/supabase-js';
import { NextResponse } from 'next/server';
import { AddressNotFoundError, geocode, GeocoderUnavailableError } from '@/lib/geocode';
import type { Point } from '@/lib/scoring';

const MAX_ADDRESS_LENGTH = 200;
const MAX_NAME_LENGTH = 40;

const errorResponse = (status: number, error: string, field?: string) =>
  NextResponse.json({ error, field }, { status });

// Saves a new route. Addresses are turned into rounded coordinates here and then dropped:
// they are never stored or logged.
export async function POST(request: Request) {
  const { userId, getToken } = await auth();
  if (!userId) return errorResponse(401, 'Sign in to save a route.');

  const body = await request.json().catch(() => null);
  const name = typeof body?.name === 'string' ? body.name.trim() : '';
  const start = typeof body?.start === 'string' ? body.start.trim() : '';
  const end = typeof body?.end === 'string' ? body.end.trim() : '';
  const toPriority = (value: unknown) => (value === 'walk' || value === 'points' ? value : 'balanced');
  const forwardPriority = toPriority(body?.forwardPriority);
  const reversePriority = toPriority(body?.reversePriority);

  if (!name || name.length > MAX_NAME_LENGTH) return errorResponse(400, `Enter a name of up to ${MAX_NAME_LENGTH} characters.`, 'name');
  if (!start || start.length > MAX_ADDRESS_LENGTH) return errorResponse(400, 'Enter a start address.', 'start');
  if (!end || end.length > MAX_ADDRESS_LENGTH) return errorResponse(400, 'Enter an end address.', 'end');

  let startPoint: Point;
  let endPoint: Point;
  const lookUp = async (address: string, field: string) => {
    try {
      return await geocode(address);
    } catch (error) {
      if (error instanceof AddressNotFoundError) {
        throw errorResponse(422, 'We couldn’t find that address. Use a street number and street name, like 233 S Wacker Dr.', field);
      }
      if (error instanceof GeocoderUnavailableError) {
        throw errorResponse(503, 'The address lookup isn’t responding. Your saved routes still work. Try again in a few minutes.');
      }
      throw error;
    }
  };
  try {
    [startPoint, endPoint] = await Promise.all([lookUp(start, 'start'), lookUp(end, 'end')]);
  } catch (response) {
    if (response instanceof NextResponse) return response;
    throw response;
  }

  // Uses the person's own token, so row-level security applies here just as it does in the browser.
  const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!, {
    accessToken: async () => getToken(),
  });

  const { count, error: countError } = await supabase.from('routes').select('id', { count: 'exact', head: true });
  if (countError) return errorResponse(500, 'We couldn’t save your route. Try again.');

  const { data, error } = await supabase
    .from('routes')
    .insert({
      name,
      is_active: count === 0,
      start_lat: startPoint.lat,
      start_lon: startPoint.lon,
      end_lat: endPoint.lat,
      end_lon: endPoint.lon,
      forward_priority: forwardPriority,
      reverse_priority: reversePriority,
    })
    .select()
    .single();

  if (error?.code === '23505') return errorResponse(409, 'You already have a route with that name.', 'name');
  if (error) return errorResponse(500, 'We couldn’t save your route. Try again.');

  return NextResponse.json({ route: data }, { status: 201 });
}
