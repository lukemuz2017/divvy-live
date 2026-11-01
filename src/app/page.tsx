import { auth } from '@clerk/nextjs/server';
import { Dashboard } from '@/components/Dashboard';
import { Landing } from '@/components/Landing';

export default async function Home() {
  const { userId } = await auth();
  return userId ? <Dashboard /> : <Landing />;
}
