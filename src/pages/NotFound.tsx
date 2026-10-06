import { useLocation } from "react-router-dom";
import { useEffect } from "react";

const NotFound = () => {
  const location = useLocation();

  useEffect(() => {
    console.error(
      "404 Error: User attempted to access non-existent route:",
      location.pathname
    );
  }, [location.pathname]);

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-100">
      <div className="text-center">
        <h1 className="text-2xl md:text-4xl font-bold mb-4">404</h1>
        <p className="text-xl text-gray-600 mb-4">{tr('Oups ! Page introuvable', 'عذرًا! الصفحة غير موجودة')}</p>
        <a href="/" className="text-blue-500 hover:text-blue-700 underline">
          {tr('Retour à l’accueil', 'العودة إلى الرئيسية')}
        </a>
      </div>
    </div>
  );
};

export default NotFound;

import { tr } from '@/lib/i18n';