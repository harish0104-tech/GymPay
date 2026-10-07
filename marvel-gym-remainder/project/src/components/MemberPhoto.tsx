import { useState } from 'react';
import { User } from 'lucide-react';

interface MemberPhotoProps {
  url: string | null;
  name: string;
  size?: 'sm' | 'md' | 'lg' | 'xl';
}

const sizeClasses = {
  sm: 'w-10 h-10',
  md: 'w-12 h-12',
  lg: 'w-16 h-16',
  xl: 'w-24 h-24',
};

const iconSizes = {
  sm: 'w-5 h-5',
  md: 'w-6 h-6',
  lg: 'w-8 h-8',
  xl: 'w-12 h-12',
};

export default function MemberPhoto({ url, name, size = 'md' }: MemberPhotoProps) {
  const [failedUrl, setFailedUrl] = useState<string | null>(null);
  if (url && url !== failedUrl) {
    return (
      <img
        src={url}
        alt={name}
        loading="lazy"
        onError={() => setFailedUrl(url)}
        className={`${sizeClasses[size]} rounded-full object-cover border border-ink-200 flex-shrink-0`}
      />
    );
  }
  return (
    <div className={`${sizeClasses[size]} rounded-full bg-ink-200 flex items-center justify-center flex-shrink-0`}>
      <User className={`${iconSizes[size]} text-ink-400`} />
    </div>
  );
}
