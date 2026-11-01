'use client';

import { UserButton, useUser } from '@clerk/nextjs';

// Used unless the person has uploaded their own photo.
const DEFAULT_AVATAR_APPEARANCE = {
  elements: {
    userButtonAvatarBox: 'divvy-avatar',
    userButtonAvatarImage: 'divvy-avatar-image',
    userPreviewAvatarBox: 'divvy-avatar',
    userPreviewAvatarImage: 'divvy-avatar-image',
  },
};

function RoutesIcon() {
  return (
    <svg viewBox="0 0 16 16" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden="true">
      <circle cx="3.5" cy="3.5" r="2" />
      <circle cx="12.5" cy="12.5" r="2" />
      <path d="M5.5 3.5h5a2.5 2.5 0 0 1 0 5h-5a2.5 2.5 0 0 0 0 5h5" />
    </svg>
  );
}

export function AccountMenu() {
  const { user } = useUser();

  return (
    <UserButton appearance={user?.hasImage ? undefined : DEFAULT_AVATAR_APPEARANCE}>
      <UserButton.MenuItems>
        <UserButton.Link label="Saved routes" labelIcon={<RoutesIcon />} href="/saved-routes" />
      </UserButton.MenuItems>
    </UserButton>
  );
}
