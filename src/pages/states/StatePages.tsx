import { useNavigate } from 'react-router';
import { NotFoundState, PermissionDenied, SessionExpiredState } from '../../components/ui/States';

export function NotFoundPage() {
  const nav = useNavigate();
  return <div className="grid min-h-[70vh] place-items-center"><NotFoundState onHome={() => nav('/')} /></div>;
}

export function SessionExpiredPage() {
  const nav = useNavigate();
  return <div className="grid min-h-[70vh] place-items-center"><SessionExpiredState onLogin={() => nav('/login')} /></div>;
}

export function PermissionDeniedPage() {
  return <div className="grid min-h-[70vh] place-items-center"><PermissionDenied /></div>;
}
