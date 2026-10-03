import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { QueryClientProvider } from '@tanstack/react-query';
import { RouterProvider } from '@tanstack/react-router';
import { brand } from '@qi/core';
import '@qi/ui/styles.css';
import { applyTheme } from './lib/theme.ts';
import { queryClient, router } from './router.tsx';

document.title = brand.appName;
applyTheme();

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <RouterProvider router={router} />
    </QueryClientProvider>
  </StrictMode>,
);
