import { auth } from '@clerk/nextjs/server';
import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { SavedRoutes } from '@/components/SavedRoutes';

export const metadata: Metadata = { title: 'Saved routes | Divvy Live' };

export default async function SavedRoutesPage() {
  const { userId } = await auth();
  if (!userId) redirect('/');
  return <SavedRoutes />;
}
