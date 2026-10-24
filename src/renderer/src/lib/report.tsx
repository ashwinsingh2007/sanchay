import { FileText, Upload } from 'lucide-react'
import { monthLabel } from '@shared/dates'
import type { MonthlyCloseReport } from '@shared/types'
import { Button, Card, EmptyState } from '../components/ui'
import { useQuery } from './hooks'
import { useUi } from './store'
import { api } from './utils'

export function useMonthlyReport(): ReturnType<typeof useQuery<MonthlyCloseReport>> & {
  month: string | null
} {
  const month = useUi((s) => s.month)
  const query = useQuery(
    () => (month ? api.getMonthlyClose(month) : Promise.reject(new Error('No month selected'))),
    [month]
  )
  return { ...query, month }
}

export function NoDataState({ month }: { month: string }): React.JSX.Element {
  const { openImport, months } = useUi()
  return (
    <Card>
      <EmptyState
        icon={<FileText className="size-5" />}
        title={
          months.length ? `No transactions in ${monthLabel(month)}` : 'Import a statement to begin'
        }
        description={
          months.length
            ? 'Import a statement that covers this month, or pick another month from the top bar.'
            : 'Upload a CSV from your bank or credit card. Everything is processed on this Mac.'
        }
        action={
          <Button
            variant="primary"
            icon={<Upload className="size-4" />}
            onClick={() => openImport()}
          >
            Import statement
          </Button>
        }
      />
    </Card>
  )
}
