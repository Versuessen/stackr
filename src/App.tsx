import React from 'react';
import { StoreProvider } from './data/store';
import { RouterProvider, useRouter } from './ui/router';
import { SearchProvider } from './ui/search';
import { Layout } from './ui/Layout';
import { HomePage } from './pages/Home';
import { ItemsPage } from './pages/Items';
import { FarmPage } from './pages/Farms';
import { MyOrdersPage, OrderPage } from './pages/Orders';
import { NoticesPage, SignInPage, TermsPage } from './pages/Account';
import { BackstagePage, BetaPage, ClientsPage, SettingsPage } from './pages/Backstage';

function Pages() {
  const { route } = useRouter();
  switch (route.page) {
    case 'items': return <ItemsPage />;
    case 'farm': return <FarmPage key={route.id} id={route.id} />;
    case 'orders': return <MyOrdersPage />;
    case 'order': return <OrderPage key={route.id} id={route.id} />;
    case 'signin': return <SignInPage />;
    case 'notices': return <NoticesPage />;
    case 'terms': return <TermsPage />;
    case 'backstage': return <BackstagePage />;
    case 'clients': return <ClientsPage />;
    case 'settings': return <SettingsPage />;
    case 'beta': return <BetaPage />;
    default: return <HomePage />;
  }
}

export function App() {
  return (
    <StoreProvider>
      <RouterProvider>
        <SearchProvider>
          <Layout><Pages /></Layout>
        </SearchProvider>
      </RouterProvider>
    </StoreProvider>
  );
}
