import type { ReactNode } from 'react';
import './settings-app-identity.css';

/** Shared identity layout for AppDock and Applet information panels. */
export function SettingsAppIdentity({
  icon,
  name,
  tagline,
  headingId,
  headingLevel = 2,
  versionTestId,
  status,
  children,
}: {
  icon: ReactNode;
  name: string;
  tagline?: string;
  headingId: string;
  headingLevel?: 1 | 2;
  versionTestId?: string;
  status?: ReactNode;
  children: ReactNode;
}) {
  const Heading = headingLevel === 1 ? 'h1' : 'h2';
  return (
    <div className="about-identity">
      {icon}
      <div className="about-identity-copy">
        {tagline && (
          <p className="about-welcome" data-testid="app-identity-tagline">
            {tagline}
          </p>
        )}
        <div className="about-name-row">
          <Heading id={headingId}>{name}</Heading>
          {status}
        </div>
        <div className="about-version" data-testid={versionTestId}>
          {children}
        </div>
      </div>
    </div>
  );
}
