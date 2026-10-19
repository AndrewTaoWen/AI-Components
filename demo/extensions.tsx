import { useState } from 'react';
import { AIFormFill, AISelect, type AIFormField, type AISelectOption } from '../src/index.js';

const departments: readonly AISelectOption[] = [
  {
    value: 'support',
    label: 'Customer support',
    description: 'Account access and technical questions',
  },
  { value: 'finance', label: 'Finance', description: 'Invoices, payments, and billing' },
  { value: 'sales', label: 'Sales', description: 'Product questions and new subscriptions' },
  { value: 'legacy', label: 'Legacy team', disabled: true },
];

const contactFields: readonly AIFormField[] = [
  { name: 'name', label: 'Name', description: 'Full contact name' },
  { name: 'email', label: 'Email', description: 'Contact email address' },
  { name: 'company', label: 'Company', description: 'Organization name' },
];
type Contact = Record<'name' | 'email' | 'company', string>;

function parseContact(data: unknown): Partial<Contact> {
  if (!data || typeof data !== 'object') throw new Error('Expected contact details.');
  const patch: Partial<Contact> = {};
  for (const { name } of contactFields) {
    const value = (data as Record<string, unknown>)[name];
    if (value === undefined) continue;
    if (typeof value !== 'string') throw new Error('Contact values must be text.');
    if (name === 'email' && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)) {
      throw new Error('Please provide a valid email address.');
    }
    patch[name as keyof Contact] = value;
  }
  return patch;
}

export function SelectExample() {
  const [department, setDepartment] = useState('');
  return (
    <>
      <p className="description">
        Choose a team normally, or describe what you need and review matching options.
      </p>
      <label className="field-label" htmlFor="department">
        Department
      </label>
      <AISelect
        id="department"
        name="department"
        value={department}
        onValueChange={setDepartment}
        options={departments}
        ai={{ prompt: 'Help route this request to the right team.' }}
        searchLabel="What do you need help with?"
      />
      <p className="footnote">
        Try “I have a billing question” or “I cannot log in.” The mock maps billing, login, and
        sales keywords to existing options.
      </p>
    </>
  );
}

export function FormFillExample() {
  const [contact, setContact] = useState<Contact>({ name: '', email: '', company: '' });
  return (
    <>
      <p className="description">
        Paste contact details and review a proposed patch before updating the fields below.
      </p>
      <AIFormFill
        fields={contactFields}
        parse={parseContact}
        onApply={(patch) => setContact((current) => ({ ...current, ...patch }))}
        placeholder={'Name: Alex Chen\nEmail: alex@example.com\nCompany: Northwind'}
        ai={{
          prompt: 'Extract contact details. Leave fields absent if they are not in the source.',
        }}
      />
      <div className="demo-contact-fields">
        {contactFields.map((field) => (
          <label key={field.name}>
            {field.label}
            <input
              type={field.name === 'email' ? 'email' : 'text'}
              value={contact[field.name as keyof Contact]}
              onChange={(event) =>
                setContact((current) => ({ ...current, [field.name]: event.target.value }))
              }
            />
          </label>
        ))}
      </div>
      <p className="footnote">
        In demo mode, use Name:, Email:, and Company: on separate lines. Missing fields stay
        untouched.
      </p>
    </>
  );
}
