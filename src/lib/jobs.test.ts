import { describe, expect, it } from 'vitest';
import { canonicalJobUrl, guessFromUrl, htmlToText, parseJobTitle, sameJobUrl } from './jobs';

describe('parseJobTitle', () => {
  it('reads LinkedIn titles', () => {
    expect(parseJobTitle('VP, Brand Marketing at Hard Rock International — Las Vegas, NV | LinkedIn Jobs')).toEqual({
      role: 'VP, Brand Marketing',
      company: 'Hard Rock International',
      location: 'Las Vegas, NV',
    });
    expect(parseJobTitle('Acme hiring Product Designer in Austin, TX | LinkedIn')).toEqual({ company: 'Acme', role: 'Product Designer', location: 'Austin, TX' });
  });

  it('reads Greenhouse, Lever and generic career-page titles', () => {
    expect(parseJobTitle('Job Application for Data Analyst at Stripe')).toMatchObject({ role: 'Data Analyst', company: 'Stripe' });
    expect(parseJobTitle('Plaid - Software Engineer', { company: 'Plaid' })).toMatchObject({ role: 'Software Engineer', company: 'Plaid' });
    expect(parseJobTitle('Marketing Manager | Careers at Notion')).toMatchObject({ role: 'Marketing Manager', company: 'Notion' });
    expect(parseJobTitle('Senior Accountant - Contoso - Remote | Indeed.com')).toMatchObject({ role: 'Senior Accountant', company: 'Contoso', location: 'Remote' });
  });
});

describe('guessFromUrl', () => {
  it('reads the company from applicant-tracking links', () => {
    expect(guessFromUrl('https://job-boards.greenhouse.io/anthropic/jobs/5456619008').company).toBe('Anthropic');
    expect(guessFromUrl('https://jobs.lever.co/hard-rock/abc').company).toBe('Hard Rock');
    expect(guessFromUrl('https://jobs.ashbyhq.com/ramp/34413f8d').company).toBe('Ramp');
  });

  it('reads company and role from Workday and SmartRecruiters', () => {
    expect(guessFromUrl('https://acme.wd5.myworkdayjobs.com/en-US/External/job/Austin-TX/Senior-Data-Analyst_R12345')).toEqual({ company: 'Acme', role: 'Senior Data Analyst' });
    expect(guessFromUrl('https://jobs.smartrecruiters.com/Visa/743999-product-manager')).toEqual({ company: 'Visa', role: 'Product Manager' });
  });

  it('uses the domain for company career sites, but not for job boards', () => {
    expect(guessFromUrl('https://careers.spotify.com/job/123').company).toBe('Spotify');
    expect(guessFromUrl('https://stripe.com/jobs/listing/x/1').company).toBe('Stripe');
    expect(guessFromUrl('https://www.indeed.com/viewjob?jk=1').company).toBeUndefined();
    expect(guessFromUrl('https://www.linkedin.com/jobs/view/4464691375/').company).toBeUndefined();
  });
});

describe('job links', () => {
  it('turns LinkedIn search links into the job page and drops tracking', () => {
    expect(canonicalJobUrl('https://www.linkedin.com/jobs/collections/recommended/?currentJobId=4464691375&trk=x')).toBe('https://www.linkedin.com/jobs/view/4464691375/');
    expect(canonicalJobUrl('https://jobs.lever.co/acme/1?utm_source=x&lever-source=LinkedIn')).toBe('https://jobs.lever.co/acme/1');
    expect(canonicalJobUrl('https://acme.com/careers?gh_jid=123&utm_medium=y')).toBe('https://acme.com/careers?gh_jid=123');
  });

  it('spots duplicates', () => {
    expect(sameJobUrl('https://www.linkedin.com/jobs/view/123456789/?refId=a', 'http://linkedin.com/jobs/view/123456789')).toBe(true);
    expect(sameJobUrl('https://jobs.lever.co/acme/1', 'https://jobs.lever.co/acme/2')).toBe(false);
  });
});

describe('htmlToText', () => {
  it('decodes Greenhouse’s escaped HTML and keeps bullets', () => {
    const html = '&lt;p&gt;About us&lt;/p&gt;&lt;ul&gt;&lt;li&gt;Design &amp;amp; build&lt;/li&gt;&lt;li&gt;Ship&lt;/li&gt;&lt;/ul&gt;';
    expect(htmlToText(html)).toBe('About us\n\n• Design & build\n• Ship');
  });
});
