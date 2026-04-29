import { useAuth } from "./hooks/useAuth";
import { AuthPage } from "./components/AuthPage";
import { CoachDashboard } from "./components/CoachDashboard";
import { OwnerDashboard } from "./components/OwnerDashboard";
import "./index.css";

function App() {
  const { coach, setCoach, loading, isOwner } = useAuth();

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <p className="text-xl">Loading...</p>
      </div>
    );
  }

  if (!coach) {
    return (
      <AuthPage
        onLogin={(selectedCoach) => setCoach(selectedCoach)}
      />
    );
  }

  if (isOwner) {
    return (
      <OwnerDashboard
        coach={coach}
        onLogout={() => setCoach(null)}
      />
    );
  }

  return (
    <CoachDashboard
      coach={coach}
      onLogout={() => setCoach(null)}
    />
  );
}

export default App;
