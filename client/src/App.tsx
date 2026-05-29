import React from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { ConfigProvider } from 'antd';
import zhCN from 'antd/locale/zh_CN';
import { AuthProvider } from './context/AuthContext';
import ProtectedRoute from './components/ProtectedRoute';
import AppLayout from './components/Layout';
import Login from './pages/Login';
import Dashboard from './pages/Dashboard';
import Orders from './pages/Orders';
import OrderDetail from './pages/OrderDetail';
import SupplierTasks from './pages/SupplierTasks';
import Suppliers from './pages/Suppliers';
import Logistics from './pages/Logistics';
import Settings from './pages/Settings';
import CustomerUpload from './pages/CustomerUpload';

export default function App() {
  return (
    <ConfigProvider locale={zhCN} theme={{
      token: {
        colorPrimary: '#1677ff',
        borderRadius: 6,
      },
    }}>
      <BrowserRouter>
        <AuthProvider>
          <Routes>
            <Route path="/login" element={<Login />} />
            <Route path="/upload" element={<CustomerUpload />} />

            <Route path="/" element={
              <ProtectedRoute><AppLayout /></ProtectedRoute>
            }>
              <Route index element={<Navigate to="/dashboard" replace />} />
              <Route path="dashboard" element={<Dashboard />} />
              <Route path="orders" element={<Orders />} />
              <Route path="orders/:id" element={<OrderDetail />} />

              {/* 供应商路由 */}
              <Route path="supplier-tasks" element={
                <ProtectedRoute allowedRoles={['supplier']}><SupplierTasks /></ProtectedRoute>
              } />

              {/* 管理员路由 */}
              <Route path="suppliers" element={
                <ProtectedRoute allowedRoles={['admin']}><Suppliers /></ProtectedRoute>
              } />

              <Route path="logistics" element={<Logistics />} />
              <Route path="settings" element={<Settings />} />
            </Route>

            <Route path="*" element={<Navigate to="/dashboard" replace />} />
          </Routes>
        </AuthProvider>
      </BrowserRouter>
    </ConfigProvider>
  );
}
