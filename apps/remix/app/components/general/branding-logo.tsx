import { useTheme } from 'remix-themes';

export type LogoProps = {
  className?: string;
};

export const BrandingLogo = ({ className }: LogoProps) => {
  const [theme] = useTheme();
  const logoSrc = theme === 'dark' ? '/static/logo-dark.png' : '/static/logo.png';

  return <img src={logoSrc} alt="Logo" className={className} style={{ objectFit: 'contain' }} />;
};
