/*
 * Pinnacle 360 — library registry
 * ───────────────────────────────
 * This is the only file you edit to add, change or remove things in the hub.
 * Save it and refresh the page. See README.md for step-by-step examples.
 *
 * kinds   'deck' — an HTML presentation (opens in the presenter)
 *         'mvp'  — a product MVP front end (opens standalone in a new tab)
 *         'doc'  — any other HTML page, PDF or report
 *
 * status  'idea' | 'proposal' | 'pilot' | 'mvp' | 'live'
 */
window.PINNACLE = {
  owner: 'Mayank Narayan',

  // Problem spaces group the library, like disciplines on a drawing register.
  // `code` prefixes sheet numbers (HR-001) and works as a search keyword.
  spaces: [
    {
      id: 'hr',
      code: 'HR',
      name: 'HR & workforce',
      blurb: 'Attendance, leave, onboarding and people data.',
    },
  ],

  items: [
    {
      id: 'hr-attendance-automation',
      sheet: 'HR-001',
      kind: 'deck',
      space: 'hr',
      status: 'proposal',
      title: 'HR Attendance Automation',
      problem: 'Managers re-type attendance that HROne already has.',
      summary:
        'A Google Apps Script calls the HROne attendance API on a daily time-driven trigger and writes Present, WFH and Leave into the team sheet. Nobody types it by hand, and the script only needs one read-only endpoint.',
      audience: 'Management, HR',
      updated: '2026-10-21',
      path: 'library/decks/hr-attendance-automation/index.html',
      highlights: [
        { value: '15–25 min', label: 'spent per manager, every working day' },
        { value: '1,760 hrs', label: 'returned a year to a 20-engineer team' },
        { value: '1 endpoint', label: 'read-only access asked of HROne' },
      ],
      slides: [
        {
          title: 'Problem',
          thumb: 'library/decks/hr-attendance-automation/thumbs/01.jpg',
          notes: 'Every day, assistant managers and senior engineers open HROne, look up each team member by name and PIS ID, and type Present, WFH or Leave into a Google Sheet. HROne already holds this data. That is 15 to 25 minutes per manager per day.',
        },
        {
          title: 'Solution',
          thumb: 'library/decks/hr-attendance-automation/thumbs/02.jpg',
          notes: 'A Google Apps Script, written in JavaScript, calls the HROne attendance API and writes the result into the sheet. We run the setup once to install a time-driven trigger. After that the trigger fires every day by itself: it calls HROne, pulls the records, and places them in the right rows. Nobody has to open the sheet.',
        },
        {
          title: 'Scope & security',
          thumb: 'library/decks/hr-attendance-automation/thumbs/03.jpg',
          notes: "We do not need access to all of HROne. Only a read-only key for the attendance log. Payroll, personal records and documents remain outside the script's reach, and any call to them is rejected. The key sits in Script Properties, the data stays in our Google Workspace, and HROne can revoke the key at any time.",
        },
        {
          title: 'Impact',
          thumb: 'library/decks/hr-attendance-automation/thumbs/04.jpg',
          notes: 'Example: the electrical team has 20 managerial engineers. At 20 minutes each per day, that is about 6.7 hours a day, roughly 147 hours a month and 1,760 hours a year handed back. Use the controls to change team size and minutes.',
        },
      ],
      tags: ['HROne', 'Google Apps Script', 'Google Sheets', 'attendance', 'automation', 'time-driven trigger', 'API', 'WFH', 'leave', 'PIS ID', 'electrical team'],
    },

    /*
     * Product MVP template — copy, fill in, and remove the comment markers.
     *
    {
      id: 'my-mvp',
      sheet: 'HR-002',
      kind: 'mvp',
      space: 'hr',
      status: 'mvp',
      title: 'Name of the MVP',
      problem: 'One sentence: the problem it solves.',
      summary: 'Two sentences on what it does and who uses it.',
      audience: 'Team leads',
      updated: '2026-10-21',
      url: 'https://my-mvp.vercel.app',          // hosted front end, or…
      // path: 'library/mvps/my-mvp/index.html', // …a local build folder
      tags: ['keywords', 'people', 'might', 'search'],
    },
     */
  ],
};
