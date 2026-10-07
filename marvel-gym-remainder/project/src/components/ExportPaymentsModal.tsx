import { useState } from 'react';
import { Download, FileText, Loader2 } from 'lucide-react';
import Modal from '@/components/ui/Modal';
import { useAuth } from '@/context/AuthContext';
import { useToast } from '@/components/ui/Toast';
import { supabase, type Member, type Payment } from '@/lib/supabase';
import { canShareNativeFile, shareNativeFile } from '@/lib/nativeFileExport';

type PaymentExportRow = Omit<Payment, 'member'> & {
  member: Pick<Member, 'name' | 'phone'> | null;
};

interface ExportPaymentsModalProps {
  open: boolean;
  initialMonth: string;
  onClose: () => void;
}

const PAGE_SIZE = 1000;

function getMonthRange(month: string) {
  const [year, monthNumber] = month.split('-').map(Number);
  const nextMonth = new Date(Date.UTC(year, monthNumber, 1));
  return {
    start: `${month}-01`,
    end: `${nextMonth.getUTCFullYear()}-${String(nextMonth.getUTCMonth() + 1).padStart(2, '0')}-01`,
  };
}

function getMonthLabel(month: string) {
  return new Date(`${month}-01T00:00:00`).toLocaleDateString('en-IN', {
    month: 'long',
    year: 'numeric',
  });
}

function formatAmount(amount: number) {
  return `INR ${Number(amount).toLocaleString('en-IN', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

async function loadPaymentsForMonth(gymId: string, month: string) {
  const { start, end } = getMonthRange(month);
  const records: PaymentExportRow[] = [];

  for (let from = 0; ; from += PAGE_SIZE) {
    const { data, error } = await supabase
      .from('payments')
      .select('*, member:members(name, phone)')
      .eq('gym_id', gymId)
      .gte('payment_date', start)
      .lt('payment_date', end)
      .order('payment_date', { ascending: true })
      .order('created_at', { ascending: true })
      .range(from, from + PAGE_SIZE - 1);

    if (error) throw error;
    const page = (data ?? []) as PaymentExportRow[];
    records.push(...page);
    if (page.length < PAGE_SIZE) break;
  }

  return records;
}

export default function ExportPaymentsModal({ open, initialMonth, onClose }: ExportPaymentsModalProps) {
  const { gym } = useAuth();
  const { toast } = useToast();
  const [month, setMonth] = useState(initialMonth);
  const [exporting, setExporting] = useState(false);

  const exportPdf = async () => {
    if (!gym || !month) return;
    setExporting(true);

    try {
      const payments = await loadPaymentsForMonth(gym.id, month);
      if (payments.length === 0) {
        toast(`No payments found for ${getMonthLabel(month)}.`, 'error');
        return;
      }

      const [{ jsPDF }, { autoTable }] = await Promise.all([
        import('jspdf'),
        import('jspdf-autotable'),
      ]);
      const doc = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' });
      const paid = payments.filter(payment => payment.status === 'paid');
      const paidTotal = paid.reduce((sum, payment) => sum + Number(payment.amount), 0);

      doc.setFillColor(11, 11, 11);
      doc.rect(0, 0, 297, 27, 'F');
      doc.setTextColor(255, 230, 0);
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(18);
      doc.text(gym.name || 'Gym', 14, 12);
      doc.setTextColor(255, 255, 255);
      doc.setFontSize(11);
      doc.text(`Payments report - ${getMonthLabel(month)}`, 14, 20);

      doc.setTextColor(11, 11, 11);
      doc.setFontSize(10);
      doc.setFont('helvetica', 'normal');
      doc.text(`Generated: ${new Date().toLocaleString('en-IN')}`, 14, 35);
      doc.text(`Records: ${payments.length}`, 14, 42);
      doc.text(`Paid collections: ${paid.length}`, 65, 42);
      doc.setFont('helvetica', 'bold');
      doc.text(`Total collected: ${formatAmount(paidTotal)}`, 125, 42);

      autoTable(doc, {
        startY: 49,
        head: [['#', 'Date', 'Member', 'Phone', 'Method', 'Status', 'Amount']],
        body: payments.map((payment, index) => [
          String(index + 1),
          new Date(`${payment.payment_date}T00:00:00`).toLocaleDateString('en-IN'),
          payment.member?.name ?? 'Unknown member',
          payment.member?.phone ?? '-',
          payment.payment_method ?? '-',
          payment.status.charAt(0).toUpperCase() + payment.status.slice(1),
          formatAmount(Number(payment.amount)),
        ]),
        theme: 'grid',
        headStyles: { fillColor: [11, 11, 11], textColor: [255, 230, 0], fontStyle: 'bold' },
        alternateRowStyles: { fillColor: [247, 247, 247] },
        styles: { font: 'helvetica', fontSize: 9, cellPadding: 2.5, textColor: [11, 11, 11] },
        columnStyles: {
          0: { cellWidth: 12, halign: 'center' },
          1: { cellWidth: 28 },
          3: { cellWidth: 35 },
          4: { cellWidth: 34 },
          5: { cellWidth: 25 },
          6: { cellWidth: 38, halign: 'right' },
        },
        didDrawPage: data => {
          doc.setFontSize(8);
          doc.setTextColor(115, 115, 115);
          doc.text(`Page ${data.pageNumber}`, 283, 202, { align: 'right' });
        },
      });

      const safeGymName = (gym.name || 'gym').trim().replace(/[^a-z0-9]+/gi, '-').replace(/^-|-$/g, '').toLowerCase();
      const filename = `${safeGymName || 'gym'}-payments-${month}.pdf`;
      if (canShareNativeFile()) {
        const dataUri = doc.output('datauristring');
        await shareNativeFile(filename, 'application/pdf', dataUri.slice(dataUri.indexOf(',') + 1));
      } else {
        doc.save(filename);
      }
      toast(`${getMonthLabel(month)} payment report created.`);
      onClose();
    } catch (error) {
      toast(error instanceof Error ? error.message : 'Could not export the payment report.', 'error');
    } finally {
      setExporting(false);
    }
  };

  return (
    <Modal open={open} onClose={exporting ? () => undefined : onClose} title="Export payments" maxWidth="max-w-md">
      <div className="space-y-5">
        <div className="flex gap-3 rounded-xl border border-ink-200 bg-ink-100 p-4">
          <FileText className="mt-0.5 h-5 w-5 shrink-0 text-ink-700" />
          <div>
            <p className="font-semibold text-ink-900">Monthly PDF report</p>
            <p className="mt-1 text-sm text-ink-500">Includes every payment recorded for the selected month, plus the paid collection total.</p>
          </div>
        </div>

        <label className="block">
          <span className="mb-1.5 block text-sm font-medium text-ink-700">Month to export</span>
          <input
            type="month"
            value={month}
            onChange={event => setMonth(event.target.value)}
            className="input-field"
            disabled={exporting}
          />
        </label>

        <div className="flex gap-3 pt-1">
          <button type="button" onClick={onClose} disabled={exporting} className="btn-secondary flex-1">
            Cancel
          </button>
          <button type="button" onClick={exportPdf} disabled={!month || exporting} className="btn-primary flex-1">
            {exporting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />}
            {exporting ? 'Creating PDF...' : 'Download PDF'}
          </button>
        </div>
      </div>
    </Modal>
  );
}
