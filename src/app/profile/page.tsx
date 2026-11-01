import { auth } from '@clerk/nextjs/server';
import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { Profile } from '@/components/Profile';

export const metadata: Metadata = { title: 'Profile | Divvy Live' };

export default async function ProfilePage() {
  const { userId } = await auth();
  if (!userId) redirect('/');
  return <Profile />;
}
