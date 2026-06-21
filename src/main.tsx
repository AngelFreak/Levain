import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import './index.css';
import App from './App.tsx';

// Create React Query client
const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 1000 * 60 * 5, // 5 minutes
      retry: 1,
    },
  },
});

// Hide loading screen after app renders
const hideLoadingScreen = () => {
  const loadingScreen = document.getElementById('loading-screen');
  if (loadingScreen) {
    // Small delay to ensure smooth transition
    setTimeout(() => {
      loadingScreen.classList.add('hidden');
      // Remove from DOM after animation
      setTimeout(() => {
        loadingScreen.remove();
      }, 400);
    }, 300);
  }
};

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <App />
    </QueryClientProvider>
  </StrictMode>
);

// Hide loading screen once React has mounted
hideLoadingScreen();
