import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { AuthProvider } from "@/contexts/AuthContext";
import ProtectedRoute from "@/components/auth/ProtectedRoute";

// Pages
import Login from "./pages/Login";
import ForgotPassword from "./pages/ForgotPassword";
import Proposals from "./pages/Proposals";
import ProposalDetails from "./pages/ProposalDetails";
import RequestMoreInfo from "./pages/RequestMoreInfo";
import PeerReviewers from "./pages/PeerReviewers";
import AuthorDashboard from "./pages/AuthorDashboard";
import AuthorProposalDetails from "./pages/AuthorProposalDetails";
import DesignerDashboard from "./pages/DesignerDashboard";
import ContractSigning from "./pages/ContractSigning";
import ContractComplete from "./pages/ContractComplete";
import NotFound from "./pages/NotFound";

const queryClient = new QueryClient();

const App = () => (
  <QueryClientProvider client={queryClient}>
    <AuthProvider>
      <TooltipProvider>
        <Toaster />
        <Sonner />
        <BrowserRouter>
          <Routes>
            {/* Public routes */}
            <Route path="/login" element={<Login />} />
            <Route path="/forgot-password" element={<ForgotPassword />} />

            {/* Protected routes */}
            <Route
              path="/proposals"
              element={
                <ProtectedRoute>
                  <Proposals />
                </ProtectedRoute>
              }
            />
            <Route
              path="/proposals/:id"
              element={
                <ProtectedRoute>
                  <ProposalDetails />
                </ProtectedRoute>
              }
            />
            <Route
              path="/proposals/:ticketNumber/request-info"
              element={
                <ProtectedRoute>
                  <RequestMoreInfo />
                </ProtectedRoute>
              }
            />
            <Route
              path="/peer-reviewers"
              element={
                <ProtectedRoute>
                  <PeerReviewers />
                </ProtectedRoute>
              }
            />
            <Route
              path="/author/proposals"
              element={
                <ProtectedRoute>
                  <AuthorDashboard />
                </ProtectedRoute>
              }
            />
            <Route
              path="/author/proposals/:id"
              element={
                <ProtectedRoute>
                  <AuthorProposalDetails />
                </ProtectedRoute>
              }
            />

            <Route
              path="/designer/proposals"
              element={
                <ProtectedRoute>
                  <DesignerDashboard />
                </ProtectedRoute>
              }
            />

            <Route
              path="/proposals/:ticketNumber/contract"
              element={
                <ProtectedRoute>
                  <ContractSigning />
                </ProtectedRoute>
              }
            />
            <Route path="/contract/complete" element={<ContractComplete />} />

            {/* Redirect root to proposals */}
            <Route path="/" element={<Navigate to="/proposals" replace />} />

            {/* 404 */}
            <Route path="*" element={<NotFound />} />
          </Routes>
        </BrowserRouter>
      </TooltipProvider>
    </AuthProvider>
  </QueryClientProvider>
);

export default App;
