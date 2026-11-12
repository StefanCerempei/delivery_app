import React, { useEffect } from 'react';
import { Link } from 'react-router-dom';
import Logo from '../components/Logo';
import { COMPANY, LICENSE_LINE } from '../data/company';
import './Legal.css';

/** Afișează valoarea din COMPANY sau un placeholder vizibil dacă nu e completată. */
export const Field = ({ value, label }) =>
    value ? <>{value}</> : <mark className="legal-placeholder">[{label}]</mark>;

export const CompanyName = () => <Field value={COMPANY.legalName} label="Company legal name" />;

const LegalLayout = ({ title, sections, children }) => {
    useEffect(() => {
        document.title = `${title} — ${COMPANY.brand}`;
        window.scrollTo(0, 0);
    }, [title]);

    return (
        <div className="legal-page">
            <header className="legal-header">
                <Link to="/" aria-label="Back to Reloq">
                    <Logo height={26} />
                </Link>
                <Link to="/" className="change-account-btn">
                    Book a move
                </Link>
            </header>

            <main className="legal-main">
                <div className="legal-title-block">
                    <h1>{title}</h1>
                    <p className="legal-meta">Effective date: {COMPANY.effectiveDate}</p>
                </div>

                {sections?.length > 0 && (
                    <nav className="legal-toc" aria-label="Contents">
                        <span className="legal-toc-label">Contents</span>
                        <ol>
                            {sections.map(([id, label]) => (
                                <li key={id}>
                                    <a href={`#${id}`}>{label}</a>
                                </li>
                            ))}
                        </ol>
                    </nav>
                )}

                <article className="legal-body">{children}</article>
            </main>

            <footer className="legal-footer">
                <div className="legal-footer-company">
                    <span>© 2026 {COMPANY.legalName}</span>
                    <span>{COMPANY.address} • {COMPANY.phone}</span>
                    <span>{LICENSE_LINE}</span>
                </div>
                <nav>
                    <Link to="/terms">Terms of Service</Link>
                    <Link to="/privacy">Privacy Policy</Link>
                    <a href={COMPANY.fmcsaRightsAndResponsibilities} target="_blank" rel="noopener noreferrer">
                        Your Rights &amp; Responsibilities
                    </a>
                    <a href={COMPANY.fmcsaReadyToMove} target="_blank" rel="noopener noreferrer">
                        Ready to Move?
                    </a>
                </nav>
            </footer>
        </div>
    );
};

export default LegalLayout;
