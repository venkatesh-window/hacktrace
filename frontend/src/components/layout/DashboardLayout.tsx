import { Outlet } from 'react-router-dom';
import { Globe } from 'lucide-react';
import { useLanguage, type Language } from '../../contexts/LanguageContext';
import traceLogo from '../../assets/trace_logo.png';

export const DashboardLayout = () => {
  const { language, setLanguage } = useLanguage();

  return (
    <div className="app-container" style={{ background: 'var(--bg-primary)', minHeight: '100vh' }}>
      <main className="main-content" style={{ display: 'flex', flexDirection: 'column', minHeight: '100vh', padding: 0 }}>
        <header className="topbar" style={{ padding: '16px 48px', borderBottom: '2px solid #e0e0e0', background: '#ffffff', display: 'flex', justifyContent: 'space-between', alignItems: 'center', minHeight: '110px', flexShrink: 0, boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.05)' }}>
          {/* Left Side: T.R.A.C.E. Logo */}
          <div style={{ display: 'flex', alignItems: 'center', minWidth: '160px' }}>
            <img 
              src={traceLogo} 
              alt="T.R.A.C.E. Logo" 
              style={{ height: '85px', width: '85px', objectFit: 'contain', cursor: 'pointer', borderRadius: '10px' }}
              onClick={() => window.location.href = '/'}
              title="T.R.A.C.E."
            />
          </div>

          {/* Center: Trilingual Title (Active language dynamically emphasized) */}
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', flex: 1, textAlign: 'center' }}>
            <h1 style={{ 
              fontSize: language === 'hi' ? '24px' : '21px', 
              fontWeight: language === 'hi' ? 900 : 700, 
              color: language === 'hi' ? '#1e3a8a' : '#000', 
              margin: '0 0 3px 0', 
              lineHeight: 1.2,
              transition: 'all 0.2s'
            }}>
              साइबर अपराध प्रवर्तन के लिए खतरा रूटिंग विश्लेषण
            </h1>
            <h2 style={{ 
              fontSize: language === 'en' ? '23px' : '19px', 
              fontWeight: language === 'en' ? 900 : 700, 
              color: language === 'en' ? '#111827' : '#000', 
              margin: '0 0 3px 0', 
              lineHeight: 1.2,
              transition: 'all 0.2s'
            }}>
              Threat Routing Analysis for Cybercrime Enforcement
            </h2>
            <h3 style={{ 
              fontSize: language === 'ta' ? '19px' : '16px', 
              fontWeight: language === 'ta' ? 900 : 600, 
              color: language === 'ta' ? '#1e3a8a' : '#000', 
              margin: 0, 
              lineHeight: 1.2,
              transition: 'all 0.2s'
            }}>
              இணையக் குற்ற அமலாக்கத்திற்கான அச்சுறுத்தல் வழித்தடப் பகுப்பாய்வு
            </h3>
          </div>

          {/* Right Side: Language Dropdown */}
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', minWidth: '160px' }}>
            {/* Language Selector Dropdown */}
            <div style={{
              display: 'flex',
              alignItems: 'center',
              gap: '8px',
              background: '#f8fafc',
              padding: '8px 14px',
              borderRadius: '8px',
              border: '1.5px solid #cbd5e1',
              boxShadow: '0 2px 4px rgba(0, 0, 0, 0.04)'
            }}>
              <Globe size={18} color="#4f46e5" />
              <select
                id="language-select"
                aria-label="Language Selector"
                value={language}
                onChange={(e) => setLanguage(e.target.value as Language)}
                style={{
                  background: 'transparent',
                  border: 'none',
                  color: '#1e293b',
                  fontSize: '13px',
                  fontWeight: 700,
                  outline: 'none',
                  cursor: 'pointer',
                  paddingRight: '4px'
                }}
              >
                <option value="en">English (EN)</option>
                <option value="ta">தமிழ் (Tamil)</option>
                <option value="hi">हिन्दी (Hindi)</option>
              </select>
            </div>
          </div>
        </header>
        
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column' }}>
          <Outlet />
        </div>
      </main>
    </div>
  );
};
