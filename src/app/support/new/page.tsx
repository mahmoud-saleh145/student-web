'use client';

import { useRouter } from 'next/navigation';
import * as React from 'react';

import { Button, Card, CardTitle } from '@/components/ui/core';
import { AppShell, InlineError, PageHeader } from '@/components/ui/feedback';
import { Input, Select, TextArea } from '@/components/ui/forms';
import { useCreateTicket } from '@/features/api';
import { useTranslation } from '@/lib/session-context';

const CATEGORIES = ['GENERAL', 'TECHNICAL', 'PAYMENT', 'ACCESS', 'CONTENT', 'OTHER'];

export default function NewTicketPage() {
  const { t } = useTranslation();
  const router = useRouter();
  const create = useCreateTicket();
  const [subject, setSubject] = React.useState('');
  const [body, setBody] = React.useState('');
  const [category, setCategory] = React.useState('GENERAL');

  const subjectValid = subject.trim().length >= 3 && subject.trim().length <= 200;
  const bodyValid = body.trim().length >= 3 && body.trim().length <= 4000;
  const canSubmit = subjectValid && bodyValid && !create.isPending;

  const submit = async () => {
    if (!canSubmit) return;
    try {
      const ticket = await create.mutateAsync({ subject: subject.trim(), body: body.trim(), category });
      router.replace(`/support/${ticket.id}`);
    } catch {
      // rendered below
    }
  };

  return (
    <AppShell>
      <PageHeader
        title={t('support.newTicket')}
        breadcrumbs={[{ href: '/support', label: t('support.title') }, { label: t('support.newTicket') }]}
      />

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_300px]">
        <Card className="max-w-3xl">
          <CardTitle>{t('support.newTicket')}</CardTitle>
          <div className="flex flex-col gap-4">
            <Input
              label={t('support.subject')}
              value={subject}
              onChange={(e) => setSubject(e.target.value)}
              maxLength={200}
              required
              error={subject.length > 0 && !subjectValid ? '3–200' : undefined}
            />
            <Select
              label={t('support.category')}
              value={category}
              onChange={(e) => setCategory(e.target.value)}
              options={CATEGORIES.map((c) => ({ value: c, label: t(`support.categories.${c}`) }))}
            />
            <TextArea
              label={t('support.message')}
              value={body}
              onChange={(e) => setBody(e.target.value)}
              rows={8}
              maxLength={4000}
              required
              error={body.length > 0 && !bodyValid ? '3–4000' : undefined}
            />
            {create.isError ? <InlineError error={create.error} /> : null}
            <div className="flex items-center gap-2 border-t border-border pt-4">
              <Button loading={create.isPending} disabled={!canSubmit} onClick={submit}>
                {t('support.send')}
              </Button>
              <Button variant="secondary" onClick={() => router.back()}>
                {t('common.cancel')}
              </Button>
            </div>
          </div>
        </Card>

        <aside className="space-y-4 lg:sticky lg:top-20 lg:self-start">
          <Card>
            <CardTitle>{t('support.ticketsTitle')}</CardTitle>
            <p className="text-[13px] leading-relaxed text-muted">{t('support.ticketsBody')}</p>
          </Card>
        </aside>
      </div>
    </AppShell>
  );
}