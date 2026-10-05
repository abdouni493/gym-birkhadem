
import { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';

const Index = () => {
  const navigate = useNavigate();
  const { user, isLoading } = useAuth();

  useEffect(() => {
    if (!isLoading) {
      if (user) {
        navigate('/dashboard');
      } else {
        navigate('/login');
      }
    }
  }, [user, isLoading, navigate]);

  return (
    <div className="min-h-screen bg-gym-black flex items-center justify-center">
      <div className="text-center">
        <div className="w-16 h-16 bg-gold-gradient rounded-full flex items-center justify-center mx-auto mb-4">
          <span className="text-2xl font-bold text-gym-black">G</span>
        </div>
        <div className="w-8 h-8 border-2 border-gym-gold border-t-transparent rounded-full animate-spin mx-auto"></div>
        <p className="text-gym-gold/60 mt-4">Loading Gym Monster...</p>
      </div>
    </div>
  );
};

export default Index;
