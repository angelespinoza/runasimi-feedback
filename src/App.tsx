import Bench from './app/Bench';
import { useState } from 'react';
import { useLang } from './i18n';
import { unlockApp, useUnlocked } from './app/lock';
import { usePath } from './app/router';
import Detail from './app/screens/Detail';
import Home from './app/screens/Home';
import Insights, { InsightEvidence } from './app/screens/Insights';
import Lock from './app/screens/Lock';
import Onboarding, { isOnboarded } from './app/screens/Onboarding';
import NewReview from './app/screens/NewReview';
import Received from './app/screens/Received';
import Reply from './app/screens/Reply';
import Settings from './app/screens/Settings';

export default function App() {
  const path = usePath();
  const unlocked = useUnlocked();
  // Al cambiar el idioma, toda la app se vuelve a pintar (sin perder lo escrito en formularios).
  useLang();
  const [onboarded, setOnboarded] = useState(isOnboarded);
  if (!onboarded) return <Onboarding onDone={() => setOnboarded(true)} />;
  if (!unlocked) return <Lock onUnlock={unlockApp} />;

  const detail = path.match(/^\/detail\/([\w-]+)$/);
  if (detail) return <Detail key={detail[1]} id={detail[1]} />;
  const reply = path.match(/^\/reply\/([\w-]+)$/);
  if (reply) return <Reply key={reply[1]} feedbackId={reply[1]} />;
  const evidence = path.match(/^\/insights\/(topic|intent|unclear)\/([\w-]+)$/);
  if (evidence) return <InsightEvidence kind={evidence[1]} id={evidence[2]} />;
  if (path === '/insights') return <Insights />;
  if (path === '/new') return <NewReview />;
  if (path === '/received') return <Received />;
  if (path === '/settings') return <Settings />;
  if (path === '/bench') return <Bench />;
  return <Home />;
}
