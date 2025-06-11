"use client";

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';

export default function AdminIndexPage() {
  const router = useRouter();

  useEffect(() => {
    // Redirect to the primary admin management page
    router.replace('/admin/projects');
  }, [router]);

  return (
    <div>
      <p>Redirecting to projects management...</p>
    </div>
  );
}
