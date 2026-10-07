import { type ReactNode } from 'react';
import { X } from 'lucide-react';

interface ModalProps {
  open: boolean;
  onClose: () => void;
  title: ReactNode;
  children: ReactNode;
  maxWidth?: string;
  variant?: 'default' | 'dark';
}

export default function Modal({ open, onClose, title, children, maxWidth = 'max-w-lg', variant = 'default' }: ModalProps) {
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/50 md:items-center md:p-4" onClick={onClose}>
      <div
        className={`${variant === 'dark' ? 'add-member-modal border-white/10 bg-black text-white' : 'card'} flex h-[100dvh] w-full ${maxWidth} flex-col overflow-hidden rounded-none md:h-auto md:max-h-[90vh] md:rounded-xl2 animate-slide-up`}
        onClick={e => e.stopPropagation()}
      >
        <div className={`z-10 flex shrink-0 items-center justify-between px-4 py-3.5 md:px-5 md:py-4 ${variant === 'dark' ? 'border-b border-white/10 bg-black/90' : 'border-b border-ink-200 bg-white'}`}>
          <h3 className="font-heading text-xl font-semibold">{title}</h3>
          <button onClick={onClose} className={`rounded-xl p-2 ${variant === 'dark' ? 'bg-white/5 text-white hover:bg-white/10' : 'text-ink-400 hover:text-ink-700'}`}>
            <X className="w-5 h-5" />
          </button>
        </div>
        <div className={`min-h-0 flex-1 overflow-y-auto overscroll-contain p-4 pb-[max(1rem,env(safe-area-inset-bottom))] md:p-5 ${variant === 'dark' ? 'scrollbar-hide' : ''}`}>
          {children}
        </div>
      </div>
    </div>
  );
}
