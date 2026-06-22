import { lazy, Suspense } from "react";
import { BrowserRouter, Navigate, Route, Routes } from "react-router-dom";
import { AdminDashboard } from "./admin/AdminDashboard";
import { AdminLayout } from "./admin/AdminLayout";
import { AdminCustomers } from "./admin/AdminCustomers";
import { AdminOrders } from "./admin/AdminOrders";
import { AdminProductForm } from "./admin/AdminProductForm";
import { AdminProducts } from "./admin/AdminProducts";
import { AdminRefunds } from "./admin/AdminRefunds";
import { AdminSettings } from "./admin/AdminSettings";
import { AdminTransactions } from "./admin/AdminTransactions";
import { Layout } from "./components/Layout";
import { ProtectedRoute } from "./components/ProtectedRoute";
import { Tracking } from "./components/Tracking";
import { RouteSeo } from "./components/RouteSeo";
import { AuthProvider } from "./context/AuthContext";
import { CartProvider } from "./context/CartContext";
import { WishlistProvider } from "./context/WishlistContext";
import { Cart } from "./pages/Cart";
import { Checkout } from "./pages/Checkout";
import { Home } from "./pages/Home";
import { OrderDetail } from "./pages/OrderDetail";
import { PaymentFailed } from "./pages/PaymentFailed";
import { ProductDetail } from "./pages/ProductDetail";
import { Shop } from "./pages/Shop";
import { Wishlist } from "./pages/Wishlist";
import { About, Blog, Brands, Careers, Company, Contact, NotFound, OrderTracking, Privacy, Returns, Shipping, Support, Terms } from "./pages/StaticPages";

const Account = lazy(() => import("./pages/Account").then((module) => ({ default: module.Account })));
const Login = lazy(() => import("./pages/Login").then((module) => ({ default: module.Login })));

function RouteSkeleton() {
  return <div className="route-skeleton" aria-label="Loading page"><span /><span /><span /></div>;
}

export function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <CartProvider>
          <WishlistProvider>
          <Tracking />
          <RouteSeo />
          <Suspense fallback={<RouteSkeleton />}>
          <Routes>
            <Route element={<Layout />}>
              <Route index element={<Home />} />
              <Route path="shop" element={<Shop />} />
              <Route path="product-category/:category" element={<Shop />} />
              <Route path="product-category/:group/:category" element={<Shop />} />
              <Route path="shop/:slug" element={<ProductDetail />} />
              <Route path="cart" element={<Cart />} />
              <Route path="wishlist" element={<Wishlist />} />
              <Route path="login" element={<Login />} />
              <Route path="about" element={<About />} />
              <Route path="contact" element={<Contact />} />
              <Route path="terms-and-conditions" element={<Terms />} />
              <Route path="shipping-policy" element={<Shipping />} />
              <Route path="shipping-delivery" element={<Shipping />} />
              <Route path="privacy-policy" element={<Privacy />} />
              <Route path="returns-policy" element={<Returns />} />
              <Route path="return-policy" element={<Returns />} />
              <Route path="blog" element={<Blog />} />
              <Route path="support" element={<Support />} />
              <Route path="24x7-support" element={<Support />} />
              <Route path="order-tracking" element={<OrderTracking />} />
              <Route path="company" element={<Company />} />
              <Route path="careers" element={<Careers />} />
              <Route path="brands" element={<Brands />} />
              <Route path="checkout" element={<ProtectedRoute><Checkout /></ProtectedRoute>} />
              <Route path="payment-failed" element={<ProtectedRoute><PaymentFailed /></ProtectedRoute>} />
              <Route path="order-success/:id" element={<ProtectedRoute><OrderDetail /></ProtectedRoute>} />
              <Route path="account" element={<ProtectedRoute><Account /></ProtectedRoute>} />
              <Route path="account/orders/:id" element={<ProtectedRoute><OrderDetail /></ProtectedRoute>} />
              <Route path="user/*" element={<Navigate to="/account" replace />} />
              <Route path="auth/login" element={<Navigate to="/login" replace />} />
              <Route path="auth/register" element={<Navigate to="/login" replace />} />
              <Route path="admin" element={<ProtectedRoute admin><AdminLayout /></ProtectedRoute>}>
                <Route index element={<AdminDashboard />} />
                <Route path="overview" element={<AdminDashboard />} />
                <Route path="products" element={<AdminProducts />} />
                <Route path="products/add" element={<AdminProductForm />} />
                <Route path="products/:id/edit" element={<AdminProductForm />} />
                <Route path="orders" element={<AdminOrders />} />
                <Route path="customers" element={<AdminCustomers />} />
                <Route path="transactions" element={<AdminTransactions />} />
                <Route path="refunds" element={<AdminRefunds />} />
                <Route path="settings" element={<AdminSettings />} />
              </Route>
              <Route path="*" element={<NotFound />} />
            </Route>
          </Routes>
          </Suspense>
          </WishlistProvider>
        </CartProvider>
      </AuthProvider>
    </BrowserRouter>
  );
}
