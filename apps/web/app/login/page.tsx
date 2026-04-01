"use client";

import Image from "next/image";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { apiPostJson } from "../lib/api";
import { useGlobalLoadingAction } from "../components/useGlobalLoadingAction";

type LoginResp = {
  tenant: {
    id: number;
    code: string;
    name: string;
    contract_end_date?: string | null;
    contract_health?: string;
  };
  user: {
    id: number;
    tenant_id: number;
    email: string;
    status_code: string;
    identity_id: number | null;
  };
  roles: string[];
};

type ContractModalState = {
  title: string;
  message: string;
} | null;

declare global {
  interface Window {
    grecaptcha?: {
      ready: (cb: () => void) => void;
      render: (
        container: HTMLElement | string,
        params: {
          sitekey: string;
          callback?: (token: string) => void;
          "expired-callback"?: () => void;
          "error-callback"?: () => void;
        }
      ) => number;
      reset: (widgetId?: number) => void;
    };
  }
}

export default function LoginPage() {
  const router = useRouter();
  const { runWithLoading, hide } = useGlobalLoadingAction();
  const inFlightRef = useRef(false);
  const captchaRef = useRef<HTMLDivElement | null>(null);
  const captchaWidgetIdRef = useRef<number | null>(null);

  const [tenantCode, setTenantCode] = useState("default");
  const [email, setEmail] = useState("admin@default.local");
  const [password, setPassword] = useState("admin123");
  const [recaptchaToken, setRecaptchaToken] = useState<string | null>(null);
  const [captchaReady, setCaptchaReady] = useState(false);

  const [err, setErr] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [contractModal, setContractModal] = useState<ContractModalState>(null);
  const recaptchaSiteKey = process.env.NEXT_PUBLIC_RECAPTCHA_SITE_KEY || "";

  useEffect(() => {
    if (!recaptchaSiteKey || typeof window === "undefined") return;

    let cancelled = false;

    const renderCaptcha = () => {
      if (cancelled || !captchaRef.current || !window.grecaptcha) return;
      if (captchaWidgetIdRef.current !== null) return;

      captchaWidgetIdRef.current = window.grecaptcha.render(captchaRef.current, {
        sitekey: recaptchaSiteKey,
        callback: (token: string) => {
          setRecaptchaToken(token);
          setErr(null);
        },
        "expired-callback": () => {
          setRecaptchaToken(null);
        },
        "error-callback": () => {
          setRecaptchaToken(null);
          setErr("Captcha verification failed. Please try again.");
        },
      });

      setCaptchaReady(true);
    };

    const handleLoad = () => {
      if (!window.grecaptcha) return;
      window.grecaptcha.ready(renderCaptcha);
    };

    const existingScript = document.getElementById("google-recaptcha-script");

    if (window.grecaptcha) {
      window.grecaptcha.ready(renderCaptcha);
      return () => {
        cancelled = true;
      };
    }

    if (!existingScript) {
      const script = document.createElement("script");
      script.id = "google-recaptcha-script";
      script.src = "https://www.google.com/recaptcha/api.js?render=explicit";
      script.async = true;
      script.defer = true;
      script.addEventListener("load", handleLoad);
      document.head.appendChild(script);

      return () => {
        cancelled = true;
        script.removeEventListener("load", handleLoad);
      };
    }

    existingScript.addEventListener("load", handleLoad);
    return () => {
      cancelled = true;
      existingScript.removeEventListener("load", handleLoad);
    };
  }, [recaptchaSiteKey]);

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();

    if (inFlightRef.current) return;
    inFlightRef.current = true;

    setErr(null);
    setContractModal(null);

    const tenantCodeTrimmed = tenantCode.trim();
    const emailTrimmed = email.trim();

    if (!tenantCodeTrimmed) {
      setErr("Tenant Code wajib diisi.");
      inFlightRef.current = false;
      return;
    }

    if (!emailTrimmed) {
      setErr("Email wajib diisi.");
      inFlightRef.current = false;
      return;
    }

    if (!password) {
      setErr("Password wajib diisi.");
      inFlightRef.current = false;
      return;
    }

    if (!recaptchaSiteKey) {
      setErr("Captcha site key belum dikonfigurasi.");
      inFlightRef.current = false;
      return;
    }

    if (!recaptchaToken) {
      setErr("Captcha verification is required");
      inFlightRef.current = false;
      return;
    }

    setSubmitting(true);

    try {
      await runWithLoading(
        async () => {
          await apiPostJson<LoginResp>("/api/v1/auth/login", {
            tenant_code: tenantCodeTrimmed,
            email: emailTrimmed,
            password,
            recaptcha_token: recaptchaToken,
          });
        },
        "Signing in..."
      );

      router.replace("/");
      router.refresh();
    } catch (error: unknown) {
      hide();

      const eAny = error as { code?: string; message?: string };
      const code = String(eAny?.code || "").toUpperCase();
      const message = eAny?.message || "Login failed";

      if (code === "TENANT_CONTRACT_EXPIRED") {
        setContractModal({
          title: "Kontrak Tenant Berakhir",
          message:
            "Kontrak organisasi Anda telah berakhir. Silakan hubungi administrator platform / Viriya untuk melakukan perpanjangan tenant.",
        });
      } else if (code === "TENANT_CONTRACT_NOT_SET") {
        setContractModal({
          title: "Kontrak Tenant Belum Aktif",
          message:
            "Tenant ini belum memiliki kontrak aktif. Silakan hubungi administrator platform / Viriya.",
        });
      } else if (code === "TENANT_SUSPENDED") {
        setContractModal({
          title: "Tenant Suspended",
          message:
            "Tenant organisasi Anda sedang dalam status suspended. Silakan hubungi administrator platform / Viriya.",
        });
      } else {
        setErr(message);
        if (code === "AUTH_CAPTCHA_INVALID" || code === "AUTH_CAPTCHA_REQUIRED") {
          setRecaptchaToken(null);
          if (captchaWidgetIdRef.current !== null && window.grecaptcha) {
            window.grecaptcha.reset(captchaWidgetIdRef.current);
          }
        }
      }
    } finally {
      inFlightRef.current = false;
      setSubmitting(false);
    }
  }

  return (
    <>
      <main className="login-shell">
        {/* Gradient Background Elements */}
        <div className="gradient-bg gradient-1" />
        <div className="gradient-bg gradient-2" />
        <div className="gradient-bg gradient-3" />
        <div className="gradient-accent accent-1" />
        <div className="gradient-accent accent-2" />

        {/* Main Container */}
        <div className="container-wrapper">
          {/* Left Content Section */}
          <section className="content-section">
            <div className="content-header">
              <span className="content-badge">ENTERPRISE</span>
              <h1 className="content-title">
                Kelola Aset Teknologi dengan Percaya Diri
              </h1>
              <p className="content-subtitle">
                Platform terpadu untuk manajemen inventaris IT, lifecycle, dan governance dengan keamanan enterprise-grade.
              </p>
            </div>

            <div className="features-grid">
              <div className="feature-item">
                <div className="feature-icon">
                  <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M9 12l2 2 4-4" />
                    <circle cx="12" cy="12" r="10" />
                  </svg>
                </div>
                <div>
                  <h3>Visibility Penuh</h3>
                  <p>Dashboard real-time untuk semua aset teknologi organisasi</p>
                </div>
              </div>

              <div className="feature-item">
                <div className="feature-icon">
                  <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
                    <path d="M7 11V7a5 5 0 0 1 10 0v4" />
                  </svg>
                </div>
                <div>
                  <h3>Keamanan Terjamin</h3>
                  <p>Enkripsi tingkat enterprise dan kontrol akses berbasis role</p>
                </div>
              </div>

              <div className="feature-item">
                <div className="feature-icon">
                  <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <polyline points="22 12 18 12 15 21 9 3 6 12 2 12" />
                  </svg>
                </div>
                <div>
                  <h3>Laporan Mendalam</h3>
                  <p>Analytics komprehensif untuk keputusan berbasis data</p>
                </div>
              </div>
            </div>

            <div className="content-footer">
              <p>© 2026 Viriya. IT Asset Management</p>
            </div>
          </section>

          {/* Right Auth Section */}
          <section className="auth-section">
            <div className="auth-container">
              {/* Header */}
              <div className="auth-header">
                <div className="logo-wrapper">
                  <Image
                    src="/viriya-logo.png"
                    alt="Viriya"
                    width={160}
                    height={54}
                    priority
                    className="logo-image"
                  />
                </div>
              </div>

              {/* Auth Content */}
              <div className="auth-content">
                <div className="greeting">
                  <h2 className="greeting-title">Selamat Datang Kembali</h2>
                  <p className="greeting-text">
                    Masuk ke portal Viriya untuk akses workspace Anda
                  </p>
                </div>

                {/* Form */}
                <form onSubmit={onSubmit} className="login-form">
                  <div className="form-group">
                    <label htmlFor="tenant" className="form-label">
                      Tenant Code
                    </label>
                    <div className="input-wrapper">
                      <input
                        id="tenant"
                        value={tenantCode}
                        onChange={(e) => setTenantCode(e.target.value)}
                        disabled={submitting}
                        className="form-input"
                        placeholder="Masukkan tenant code"
                        autoComplete="organization"
                      />
                      <svg className="input-icon" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
                        <circle cx="12" cy="7" r="4" />
                      </svg>
                    </div>
                  </div>

                  <div className="form-group">
                    <label htmlFor="email" className="form-label">
                      Email Address
                    </label>
                    <div className="input-wrapper">
                      <input
                        id="email"
                        type="email"
                        value={email}
                        onChange={(e) => setEmail(e.target.value)}
                        disabled={submitting}
                        className="form-input"
                        placeholder="nama@perusahaan.com"
                        autoComplete="email"
                      />
                      <svg className="input-icon" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <rect x="2" y="4" width="20" height="16" rx="2" />
                        <path d="m22 7-8.97 5.7a1.94 1.94 0 0 1-2.06 0L2 7" />
                      </svg>
                    </div>
                  </div>

                  <div className="form-group">
                    <label htmlFor="password" className="form-label">
                      Password
                    </label>
                    <div className="input-wrapper">
                      <input
                        id="password"
                        type="password"
                        value={password}
                        onChange={(e) => setPassword(e.target.value)}
                        disabled={submitting}
                        className="form-input"
                        placeholder="••••••••"
                        autoComplete="current-password"
                      />
                      <svg className="input-icon" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <path d="M2.062 12.348a1 1 0 0 1 0-.696 10.75 10.75 0 1 1 19.876 0 1 1 0 0 1 0 .696A10.75 10.75 0 0 1 2.062 12.348" />
                        <circle cx="12" cy="12" r="3" />
                      </svg>
                    </div>
                  </div>

                  {err && <div className="error-message">{err}</div>}

                  <div className="captcha-wrapper">
                    <div className="captcha-host" ref={captchaRef} />
                    {!captchaReady ? (
                      <p className="captcha-hint">Loading captcha...</p>
                    ) : null}
                  </div>

                  <button
                    type="submit"
                    disabled={submitting}
                    className="submit-btn"
                  >
                    {submitting ? (
                      <>
                        <span className="spinner" />
                        Sedang Masuk...
                      </>
                    ) : (
                      <>
                        <span>Masuk ke Viriya</span>
                        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                          <line x1="5" y1="12" x2="19" y2="12" />
                          <polyline points="12 5 19 12 12 19" />
                        </svg>
                      </>
                    )}
                  </button>
                </form>

                {/* Footer Links */}
                <div className="auth-footer">
                  <p className="support-text">
                    Butuh bantuan? <span className="support-link">Hubungi Admin</span>
                  </p>
                  <p className="hint-text">
                    Tip: Gunakan <code>default</code> untuk tenant pertama
                  </p>
                </div>
              </div>
            </div>
          </section>
        </div>
      </main>

      {contractModal ? (
        <div className="modal-shell">
          <div className="modal-backdrop" onClick={() => setContractModal(null)} />
          <div className="modal-card">
            <div className="modal-strip" />
            <div className="modal-title">{contractModal.title}</div>
            <div className="modal-message">{contractModal.message}</div>
            <div className="modal-actions">
              <button
                type="button"
                onClick={() => setContractModal(null)}
                className="modal-button"
              >
                OK
              </button>
            </div>
          </div>
        </div>
      ) : null}

      <style jsx>{`
        * {
          margin: 0;
          padding: 0;
          box-sizing: border-box;
        }

        .login-shell {
          position: relative;
          min-height: 100vh;
          overflow: hidden;
          background: linear-gradient(135deg, #0f1419 0%, #1a1f2e 50%, #0d1117 100%);
          font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", "Roboto", "Oxygen", "Ubuntu", "Cantarell", sans-serif;
          color: #0f172a;
        }

        /* Gradient Background Elements */
        .gradient-bg {
          position: absolute;
          border-radius: 9999px;
          filter: blur(120px);
          opacity: 0.12;
          pointer-events: none;
        }

        .gradient-1 {
          width: 400px;
          height: 400px;
          background: #22d3ee;
          top: -100px;
          right: -100px;
        }

        .gradient-2 {
          width: 350px;
          height: 350px;
          background: #0ea5e9;
          bottom: 10%;
          left: -80px;
        }

        .gradient-3 {
          width: 280px;
          height: 280px;
          background: #f59e0b;
          top: 50%;
          right: 10%;
        }

        .gradient-accent {
          position: absolute;
          filter: blur(80px);
          pointer-events: none;
        }

        .accent-1 {
          width: 300px;
          height: 300px;
          background: rgba(34, 211, 238, 0.15);
          top: 20%;
          left: 5%;
          border-radius: 9999px;
        }

        .accent-2 {
          width: 250px;
          height: 250px;
          background: rgba(245, 158, 11, 0.1);
          bottom: 15%;
          right: 5%;
          border-radius: 9999px;
        }

        /* Main Container */
        .container-wrapper {
          position: relative;
          z-index: 1;
          min-height: 100vh;
          display: grid;
          grid-template-columns: 1fr 1fr;
          gap: 40px;
          padding: 60px 64px;
          max-width: 1440px;
          margin: 0 auto;
        }

        /* Content Section */
        .content-section {
          display: flex;
          flex-direction: column;
          justify-content: center;
          gap: 50px;
        }

        .content-header {
          display: flex;
          flex-direction: column;
          gap: 20px;
        }

        .content-badge {
          display: inline-flex;
          align-items: center;
          width: fit-content;
          padding: 8px 14px;
          background: linear-gradient(135deg, rgba(34, 211, 238, 0.15), rgba(14, 165, 233, 0.1));
          border: 1px solid rgba(34, 211, 238, 0.3);
          border-radius: 20px;
          color: #22d3ee;
          font-size: 0.75rem;
          font-weight: 700;
          letter-spacing: 0.15em;
          text-transform: uppercase;
          backdrop-filter: blur(8px);
        }

        .content-title {
          font-size: 3.5rem;
          font-weight: 900;
          line-height: 1.15;
          letter-spacing: -0.03em;
          background: linear-gradient(135deg, #ffffff 0%, #cbd5e1 100%);
          -webkit-background-clip: text;
          -webkit-text-fill-color: transparent;
          background-clip: text;
          max-width: 600px;
        }

        .content-subtitle {
          font-size: 1.1rem;
          line-height: 1.7;
          color: #cbd5e1;
          max-width: 580px;
          font-weight: 400;
        }

        /* Features Grid */
        .features-grid {
          display: flex;
          flex-direction: column;
          gap: 24px;
          max-width: 580px;
        }

        .feature-item {
          display: flex;
          align-items: flex-start;
          gap: 16px;
          padding: 20px;
          border-radius: 20px;
          background: rgba(30, 41, 59, 0.5);
          border: 1px solid rgba(34, 211, 238, 0.2);
          backdrop-filter: blur(10px);
          transition: all 0.3s ease;
        }

        .feature-item:hover {
          background: rgba(30, 41, 59, 0.7);
          border-color: rgba(34, 211, 238, 0.4);
          transform: translateX(8px);
        }

        .feature-icon {
          flex-shrink: 0;
          width: 48px;
          height: 48px;
          display: flex;
          align-items: center;
          justify-content: center;
          border-radius: 12px;
          background: linear-gradient(135deg, #22d3ee, #0ea5e9);
          color: #ffffff;
        }

        .feature-item h3 {
          font-size: 1rem;
          font-weight: 700;
          color: #ffffff;
          margin-bottom: 4px;
        }

        .feature-item p {
          font-size: 0.9rem;
          color: #94a3b8;
          line-height: 1.5;
        }

        .content-footer {
          padding-top: 20px;
          border-top: 1px solid rgba(94, 109, 127, 0.3);
          color: #64748b;
          font-size: 0.9rem;
        }

        /* Auth Section */
        .auth-section {
          display: flex;
          align-items: center;
          justify-content: center;
        }

        .auth-container {
          width: 100%;
          max-width: 420px;
          background: #ffffff;
          border-radius: 24px;
          box-shadow: 0 20px 80px rgba(0, 0, 0, 0.4);
          overflow: hidden;
          animation: slideUp 0.6s ease-out;
        }

        @keyframes slideUp {
          from {
            opacity: 0;
            transform: translateY(30px);
          }
          to {
            opacity: 1;
            transform: translateY(0);
          }
        }

        .auth-header {
          padding: 28px 32px 24px;
          text-align: center;
        }

        .logo-wrapper {
          display: inline-flex;
          align-items: center;
          justify-content: center;
        }

        .logo-image {
          width: auto;
          height: auto;
          max-width: 120px;
          opacity: 0.95;
        }

        .auth-content {
          padding: 32px;
          display: flex;
          flex-direction: column;
          gap: 28px;
        }

        .greeting {
          text-align: center;
        }

        .greeting-title {
          font-size: 1.75rem;
          font-weight: 800;
          color: #0f172a;
          letter-spacing: -0.02em;
          margin-bottom: 8px;
        }

        .greeting-text {
          font-size: 0.95rem;
          color: #64748b;
          line-height: 1.6;
        }

        /* Form Styles */
        .login-form {
          display: flex;
          flex-direction: column;
          gap: 18px;
        }

        .form-group {
          display: flex;
          flex-direction: column;
          gap: 8px;
        }

        .form-label {
          font-size: 0.85rem;
          font-weight: 700;
          color: #334155;
          text-transform: uppercase;
          letter-spacing: 0.05em;
        }

        .input-wrapper {
          position: relative;
          display: flex;
          align-items: center;
        }

        .form-input {
          width: 100%;
          padding: 12px 16px 12px 44px;
          border: 2px solid #e2e8f0;
          border-radius: 12px;
          background: #f8fafc;
          font-size: 0.95rem;
          color: #0f172a;
          outline: none;
          transition: all 0.3s ease;
          font-weight: 500;
        }

        .form-input::placeholder {
          color: #cbd5e1;
        }

        .form-input:focus {
          border-color: #22d3ee;
          background: #ffffff;
          box-shadow: 0 0 0 3px rgba(34, 211, 238, 0.1);
        }

        .form-input:disabled {
          background: #f1f5f9;
          color: #94a3b8;
          cursor: not-allowed;
        }

        .input-icon {
          position: absolute;
          left: 14px;
          color: #cbd5e1;
          pointer-events: none;
          transition: color 0.3s ease;
        }

        .form-input:focus ~ .input-icon,
        .form-input:not(:placeholder-shown) ~ .input-icon {
          color: #22d3ee;
        }

        /* Error Message */
        .error-message {
          padding: 12px 16px;
          border-radius: 12px;
          background: #fef2f2;
          border: 1px solid #fecaca;
          color: #91000e;
          font-size: 0.9rem;
          line-height: 1.5;
          animation: shake 0.4s ease-in-out;
        }

        @keyframes shake {
          0%, 100% { transform: translateX(0); }
          25% { transform: translateX(-5px); }
          75% { transform: translateX(5px); }
        }

        .captcha-wrapper {
          display: flex;
          flex-direction: column;
          gap: 10px;
          margin-top: 4px;
          align-items: center;
          width: 100%;
        }

        .captcha-host {
          display: flex;
          justify-content: center;
          width: 100%;
          max-width: 100%;
          overflow-x: auto;
        }

        .captcha-hint {
          font-size: 0.8rem;
          line-height: 1.4;
          color: #64748b;
          text-align: center;
        }

        /* Submit Button */
        .submit-btn {
          padding: 13px 20px;
          margin-top: 8px;
          border: none;
          border-radius: 12px;
          background: linear-gradient(135deg, #22d3ee 0%, #0ea5e9 50%, #0284c7 100%);
          color: #ffffff;
          font-size: 0.95rem;
          font-weight: 700;
          letter-spacing: 0.02em;
          cursor: pointer;
          transition: all 0.3s ease;
          display: flex;
          align-items: center;
          justify-content: center;
          gap: 10px;
          position: relative;
          overflow: hidden;
          box-shadow: 0 10px 30px rgba(34, 211, 238, 0.3);
        }

        .submit-btn::before {
          content: '';
          position: absolute;
          top: 0;
          left: -100%;
          width: 100%;
          height: 100%;
          background: rgba(255, 255, 255, 0.15);
          transition: left 0.5s ease;
        }

        .submit-btn:hover::before {
          left: 100%;
        }

        .submit-btn:hover:not(:disabled) {
          transform: translateY(-2px);
          box-shadow: 0 15px 40px rgba(34, 211, 238, 0.4);
        }

        .submit-btn:active:not(:disabled) {
          transform: translateY(0);
        }

        .submit-btn:disabled {
          opacity: 0.6;
          cursor: not-allowed;
        }

        .spinner {
          display: inline-block;
          width: 16px;
          height: 16px;
          border: 2px solid rgba(255, 255, 255, 0.3);
          border-top-color: #ffffff;
          border-radius: 50%;
          animation: spin 0.8s linear infinite;
        }

        @keyframes spin {
          to { transform: rotate(360deg); }
        }

        /* Auth Footer */
        .auth-footer {
          padding-top: 20px;
          border-top: 1px solid #e2e8f0;
          display: flex;
          flex-direction: column;
          gap: 12px;
          text-align: center;
        }

        .support-text {
          font-size: 0.9rem;
          color: #64748b;
        }

        .support-link {
          color: #0ea5e9;
          font-weight: 700;
          cursor: pointer;
          transition: color 0.2s ease;
        }

        .support-link:hover {
          color: #0284c7;
        }

        .hint-text {
          font-size: 0.8rem;
          color: #cbd5e1;
          line-height: 1.5;
        }

        .hint-text code {
          background: #f1f5f9;
          color: #0ea5e9;
          padding: 2px 6px;
          border-radius: 4px;
          font-family: "Monaco", "Menlo", "Courier New", monospace;
          font-weight: 600;
        }

        /* Modal Styles */
        .modal-shell {
          position: fixed;
          inset: 0;
          z-index: 10000;
          display: flex;
          align-items: center;
          justify-content: center;
          padding: 16px;
        }

        .modal-backdrop {
          position: absolute;
          inset: 0;
          background: rgba(2, 6, 23, 0.65);
          backdrop-filter: blur(6px);
        }

        .modal-card {
          position: relative;
          width: 100%;
          max-width: 420px;
          overflow: hidden;
          border-radius: 24px;
          background: #ffffff;
          border: 1px solid #e2e8f0;
          box-shadow: 0 24px 80px rgba(0, 0, 0, 0.35);
          animation: slideUp 0.3s ease-out;
        }

        .modal-strip {
          height: 5px;
          background: linear-gradient(90deg, #22d3ee, #0ea5e9, #f59e0b);
        }

        .modal-title {
          padding: 22px 24px 0;
          color: #0f172a;
          font-size: 1.05rem;
          font-weight: 800;
        }

        .modal-message {
          padding: 10px 24px 0;
          color: #475569;
          font-size: 0.95rem;
          line-height: 1.7;
        }

        .modal-actions {
          padding: 22px 24px 24px;
          display: flex;
          justify-content: flex-end;
        }

        .modal-button {
          border: none;
          border-radius: 10px;
          padding: 10px 20px;
          background: linear-gradient(135deg, #22d3ee, #0ea5e9);
          color: #ffffff;
          font-size: 0.92rem;
          font-weight: 700;
          cursor: pointer;
          transition: all 0.3s ease;
        }

        .modal-button:hover {
          transform: translateY(-1px);
          box-shadow: 0 8px 20px rgba(34, 211, 238, 0.3);
        }

        /* Responsive Design */
        @media (max-width: 1024px) {
          .container-wrapper {
            grid-template-columns: 1fr;
            padding: 40px 32px;
            gap: 30px;
          }

          .content-section {
            justify-content: flex-start;
            padding-top: 20px;
          }

          .content-title {
            font-size: 2.5rem;
          }

          .auth-section {
            justify-content: center;
            min-height: auto;
          }

          .content-footer {
            order: 3;
            margin-top: 30px;
          }

          .auth-container {
            order: 1;
          }
        }

        @media (max-width: 768px) {
          .login-shell {
            overflow-y: auto;
          }

          .container-wrapper {
            grid-template-columns: 1fr;
            padding: 32px 16px;
            gap: 24px;
            min-height: auto;
          }

          .content-section {
            display: none;
          }

          .content-title {
            font-size: 2rem;
          }

          .features-grid {
            grid-template-columns: 1fr;
          }

          .auth-container {
            width: 100%;
            border-radius: 20px;
          }

          .auth-content {
            padding: 24px;
            gap: 20px;
          }

          .greeting-title {
            font-size: 1.5rem;
          }

          .form-input {
            padding: 11px 14px 11px 40px;
            font-size: 16px;
          }

          .input-icon {
            width: 18px;
            height: 18px;
            left: 12px;
          }

          .submit-btn {
            padding: 12px 16px;
          }
        }

        @media (max-width: 480px) {
          .container-wrapper {
            padding: 24px 12px;
          }

          .auth-container {
            border-radius: 16px;
          }

          .auth-header {
            padding: 24px 24px 0;
          }

          .auth-content {
            padding: 20px;
          }

          .greeting-title {
            font-size: 1.3rem;
          }

          .greeting-text {
            font-size: 0.9rem;
          }

          .form-label {
            font-size: 0.8rem;
          }

          .form-input {
            padding: 10px 12px 10px 36px;
            font-size: 16px;
            border-radius: 10px;
          }

          .submit-btn {
            padding: 11px 14px;
            font-size: 0.9rem;
          }
        }
      `}</style>
    </>
  );
}
