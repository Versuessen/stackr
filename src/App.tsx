import React from 'react';
import { StoreProvider } from './data/store';
import { RouterProvider, useRouter } from './ui/router';
import { Layout } from './ui/Layout';
import { SellerPage, SellersPage } from './pages/Sellers';
import { NewOrderPage } from './pages/NewOrder';
import { MyOrdersPage, OrderPage } from './pages/Orders';
import { NoticesPage, SignInPage, TermsPage } from './pages/Account';
import { BackstagePage, BetaPage, ClientsPage, SettingsPage } from './pages/Backstage';

function Pages() {
  const { route } = useRouter();
  switch (route.page) {
    case 'seller': return <SellerPage id={route.id} />;
    case 'new': return <NewOrderPage key={route.id} serviceId={route.id} />;
    case 'orders': return <MyOrdersPage />;
    case 'order': return <OrderPage key={route.id} id={route.id} />;
    case 'signin': return <SignInPage />;
    case 'notices': return <NoticesPage />;
    case 'terms': return <TermsPage />;
    case 'backstage': return <BackstagePage />;
    case 'clients': return <ClientsPage />;
    case 'settings': return <SettingsPage />;
    case 'beta': return <BetaPage />;
    default: return <SellersPage />;
  }
}

export function App() {
  return (
    <StoreProvider>
      <RouterProvider>
        <Layout><Pages /></Layout>
      </RouterProvider>
    </StoreProvider>
  );
}
