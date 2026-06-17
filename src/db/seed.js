// src/db/seed.js
require('dotenv').config();
const { Pool } = require('pg');
const bcrypt = require('bcryptjs');

const pool = new Pool({ connectionString: process.env.DATABASE_URL });

const sections = [
  { key: 'personal',      label: 'Personal Information',       icon: 'user',          sort_order: 1 },
  { key: 'salary',        label: 'Salary Documents',           icon: 'briefcase',     sort_order: 2 },
  { key: 'house',         label: 'House Property',             icon: 'home',          sort_order: 3 },
  { key: 'capital_gains', label: 'Capital Gains',              icon: 'trending-up',   sort_order: 4 },
  { key: 'business',      label: 'Business / Profession',      icon: 'building-store',sort_order: 5 },
  { key: 'deductions',    label: 'Deductions (80C, 80D…)',     icon: 'heart',         sort_order: 6 },
  { key: 'other',         label: 'Other Information',          icon: 'info-circle',   sort_order: 7 },
];

const checklistItems = [
  // Personal
  { section_key: 'personal', label: 'PAN Card',              description: 'Permanent Account Number card copy',           is_deduction: false, allows_multi: false, sort_order: 1 },
  { section_key: 'personal', label: 'Aadhaar Card',          description: '12-digit Unique ID copy (front & back)',        is_deduction: false, allows_multi: false, sort_order: 2 },
  { section_key: 'personal', label: 'Bank Account Details',  description: 'Cancelled cheque or passbook copy for refund',  is_deduction: false, allows_multi: true,  sort_order: 3 },
  { section_key: 'personal', label: 'Last Year ITR',         description: "Previous year's filed Income Tax Return copy",  is_deduction: false, allows_multi: false, sort_order: 4 },

  // Salary
  { section_key: 'salary', label: 'Form 16 (Part A & B)',   description: 'TDS certificate issued by employer',            is_deduction: false, allows_multi: false, sort_order: 1 },
  { section_key: 'salary', label: 'Salary Slips',           description: 'April 2024 – March 2025 (all 12 months)',       is_deduction: false, allows_multi: true,  sort_order: 2 },
  { section_key: 'salary', label: 'Form 12BB',              description: 'Investment declaration submitted to employer',   is_deduction: false, allows_multi: false, sort_order: 3 },
  { section_key: 'salary', label: 'Form 26AS / AIS',        description: 'Annual Information Statement from income tax portal', is_deduction: false, allows_multi: false, sort_order: 4 },
  { section_key: 'salary', label: 'Bank Statements',        description: 'All bank account statements Apr 2024–Mar 2025', is_deduction: false, allows_multi: true,  sort_order: 5 },

  // House Property
  { section_key: 'house', label: 'Housing Loan Certificate',   description: 'Interest & principal certificate from lender', is_deduction: false, allows_multi: true,  sort_order: 1 },
  { section_key: 'house', label: 'Rental Income Details',      description: 'Rent receipts / rental agreement',             is_deduction: false, allows_multi: true,  sort_order: 2 },
  { section_key: 'house', label: 'Property Tax Paid',          description: 'Municipal tax receipts for the property',      is_deduction: false, allows_multi: false, sort_order: 3 },
  { section_key: 'house', label: 'Co-owner PAN (if any)',      description: 'PAN of co-owner for joint property',           is_deduction: false, allows_multi: false, sort_order: 4 },

  // Capital Gains
  { section_key: 'capital_gains', label: 'Equity / MF Capital Gain Statement', description: 'From broker / CAMS / Kfintech',             is_deduction: false, allows_multi: true,  sort_order: 1 },
  { section_key: 'capital_gains', label: 'Property Sale Documents',            description: 'Sale deed, purchase deed, cost details',    is_deduction: false, allows_multi: true,  sort_order: 2 },
  { section_key: 'capital_gains', label: 'Demat Account Statement',            description: 'Full year demat statement from broker',     is_deduction: false, allows_multi: true,  sort_order: 3 },
  { section_key: 'capital_gains', label: 'Crypto P&L Statement',               description: 'Profit & loss from crypto exchange',        is_deduction: false, allows_multi: false, sort_order: 4 },

  // Business
  { section_key: 'business', label: 'Business Income Details',     description: 'P&L account / turnover details',                is_deduction: false, allows_multi: true,  sort_order: 1 },
  { section_key: 'business', label: 'Balance Sheet',               description: 'If accounts are maintained',                    is_deduction: false, allows_multi: false, sort_order: 2 },
  { section_key: 'business', label: 'GST Returns (GSTR-1/3B)',     description: 'Filed GST return copies',                       is_deduction: false, allows_multi: true,  sort_order: 3 },
  { section_key: 'business', label: 'TDS Certificates (Form 16A)', description: 'TDS deducted by clients/customers',             is_deduction: false, allows_multi: true,  sort_order: 4 },

  // Deductions (old regime only)
  { section_key: 'deductions', label: 'LIC Premium Receipts',        description: '80C – Life insurance premium paid',             is_deduction: true,  allows_multi: true,  sort_order: 1 },
  { section_key: 'deductions', label: 'PPF Passbook / Statement',    description: '80C – Public Provident Fund deposits',          is_deduction: true,  allows_multi: false, sort_order: 2 },
  { section_key: 'deductions', label: 'ELSS / Mutual Fund Receipts', description: '80C – Tax-saving mutual fund investments',       is_deduction: true,  allows_multi: true,  sort_order: 3 },
  { section_key: 'deductions', label: 'School / Tuition Fee Receipt',description: "80C – Children's tuition fees paid",             is_deduction: true,  allows_multi: true,  sort_order: 4 },
  { section_key: 'deductions', label: 'Health Insurance Premium',    description: '80D – Policy certificate + payment proof',      is_deduction: true,  allows_multi: true,  sort_order: 5 },
  { section_key: 'deductions', label: 'NPS Contribution Statement',  description: '80CCD(1B) – National Pension System',           is_deduction: true,  allows_multi: false, sort_order: 6 },
  { section_key: 'deductions', label: 'Donation Receipts (80G)',     description: '80G – Charitable donations with 80G certificate',is_deduction: true,  allows_multi: true,  sort_order: 7 },
  { section_key: 'deductions', label: 'Education Loan Certificate',  description: '80E – Interest on education loan',               is_deduction: true,  allows_multi: false, sort_order: 8 },
  { section_key: 'deductions', label: 'Home Loan – First Time Buyer',description: '80EE / 80EEA – Additional interest deduction',   is_deduction: true,  allows_multi: false, sort_order: 9 },

  // Other
  { section_key: 'other', label: 'Foreign Income / Assets',          description: 'If you have income or assets outside India',     is_deduction: false, allows_multi: true,  sort_order: 1 },
  { section_key: 'other', label: 'Interest from FD / Savings',       description: 'Bank interest certificates for all accounts',    is_deduction: false, allows_multi: true,  sort_order: 2 },
  { section_key: 'other', label: 'Dividend Income Statement',        description: 'Dividends received from shares/MF',              is_deduction: false, allows_multi: false, sort_order: 3 },
  { section_key: 'other', label: 'Agriculture Income Details',       description: 'If any agricultural income received',            is_deduction: false, allows_multi: false, sort_order: 4 },
];

async function seed() {
  const client = await pool.connect();
  try {
    console.log('Seeding database...');

    // Sections
    for (const s of sections) {
      await client.query(
        `INSERT INTO sections (key, label, icon, sort_order)
         VALUES ($1,$2,$3,$4) ON CONFLICT (key) DO UPDATE SET label=$2, icon=$3, sort_order=$4`,
        [s.key, s.label, s.icon, s.sort_order]
      );
    }
    console.log(`✅ Seeded ${sections.length} sections`);

    // Items
    for (const item of checklistItems) {
      await client.query(
        `INSERT INTO checklist_items (section_key, label, description, is_deduction, allows_multi, sort_order)
         VALUES ($1,$2,$3,$4,$5,$6)
         ON CONFLICT DO NOTHING`,
        [item.section_key, item.label, item.description, item.is_deduction, item.allows_multi, item.sort_order]
      );
    }
    console.log(`✅ Seeded ${checklistItems.length} checklist items`);

    // Admin user
    const adminEmail = process.env.ADMIN_EMAIL || 'admin@taxportal.com';
    const adminPass  = process.env.ADMIN_INIT_PASSWORD || 'ChangeMe@123';
    const hash = await bcrypt.hash(adminPass, 12);
    await client.query(
      `INSERT INTO admin_users (email, password_hash, name)
       VALUES ($1,$2,'Admin') ON CONFLICT (email) DO NOTHING`,
      [adminEmail, hash]
    );
    console.log(`✅ Admin user created: ${adminEmail}`);
    console.log(`   Default password: ${adminPass} — CHANGE THIS IMMEDIATELY`);

    client.release();
    process.exit(0);
  } catch (err) {
    console.error('❌ Seed failed:', err.message);
    process.exit(1);
  }
}

seed();
