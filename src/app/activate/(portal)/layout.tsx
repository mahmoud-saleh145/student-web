import { ActivationShell } from '@/activation/components/ActivationShell';

/** Every signed-in portal page: the portal's header, navigation and footer. */
export default function ActivationPortalLayout({ children }: { children: React.ReactNode }) {
  return <ActivationShell>{children}</ActivationShell>;
}
