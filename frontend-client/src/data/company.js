// Datele firmei folosite în paginile legale și în footer.
// Sursa: site-ul principal https://www.reloqmove.com

export const COMPANY = {
    brand: 'RELOQ Moving Services',
    legalName: 'RELOQ Moving Services LLC',
    address: '98 Mountain Gate Rd., Ashland, MA 01721',
    phone: '(508) 816-7230',
    supportEmail: 'info@reloqmove.com',
    privacyEmail: 'info@reloqmove.com',
    website: 'reloqmove.com',
    websiteUrl: 'https://www.reloqmove.com',
    governingLaw: 'the Commonwealth of Massachusetts, USA',
    serviceArea: 'Massachusetts',
    effectiveDate: 'November 12, 2026',

    // Licențe — trebuie afișate pe site (cerință FMCSA)
    usdot: '4182047',
    mc: '1623651',
    madpu: '24HG10',

    // Linkuri FMCSA obligatorii pentru transportatori (49 CFR 375.213)
    fmcsaReadyToMove: 'https://www.fmcsa.dot.gov/sites/fmcsa.dot.gov/files/ReadytoMoveBrochure_2022Update.pdf',
    fmcsaRightsAndResponsibilities: 'https://www.fmcsa.dot.gov/protect-your-move/consumer-rights',

    // Politica de anulare din Terms (ajustează după tariful vostru)
    freeCancellationHours: 24,
    lateCancellationFeePercent: 25
};

/** Linia de licențe, în formatul cerut: „U.S. DOT No. …” */
export const LICENSE_LINE = `U.S. DOT No. ${COMPANY.usdot} • MC No. ${COMPANY.mc} • MA DPU No. ${COMPANY.madpu}`;
