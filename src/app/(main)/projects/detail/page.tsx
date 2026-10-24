import { Suspense } from 'react';
import { ProjectDetailClient } from './project-detail-client';

// A static route that reads the project from the query string
// (`/projects/detail?id=...`), like `/sessions/detail`: the Android build is a
// static export, so there are no dynamic segments.
export default function ProjectDetailPage() {
  return (
    <Suspense fallback={<div className="text-text-muted text-sm">Loading project…</div>}>
      <ProjectDetailClient />
    </Suspense>
  );
}
