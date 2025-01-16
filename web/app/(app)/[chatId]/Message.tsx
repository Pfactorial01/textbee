import { format } from 'date-fns'

interface MessageProps {
  message: string
  type: 'SENT' | 'RECEIVED'
  timestamp: string
}

export function Message({ message, type, timestamp }: MessageProps) {
  const isReceived = type === 'RECEIVED'
  const alignmentClass = isReceived ? 'justify-start' : 'justify-end'
  const bgColorClass = isReceived ? 'bg-gray-200' : 'bg-blue-500 text-white'

  return (
    <div className={`flex ${alignmentClass} mb-4`}>
      <div className={`max-w-xs md:max-w-md rounded-lg px-4 py-2 ${bgColorClass}`}>
        <p className="text-sm">{message}</p>
        <p className="text-xs mt-1 opacity-70">
          {format(new Date(timestamp), 'MMM d, yyyy HH:mm')}
        </p>
      </div>
    </div>
  )
}

