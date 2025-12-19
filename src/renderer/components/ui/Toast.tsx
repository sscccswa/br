import { useEffect } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { X, CheckCircle, AlertCircle, AlertTriangle, Info } from 'lucide-react'
import { useNotificationStore, NotificationType } from '../../stores/notification-store'

const icons: Record<NotificationType, React.ReactNode> = {
  success: <CheckCircle className="h-5 w-5 text-green-400" />,
  error: <AlertCircle className="h-5 w-5 text-red-400" />,
  warning: <AlertTriangle className="h-5 w-5 text-yellow-400" />,
  info: <Info className="h-5 w-5 text-blue-400" />,
}

const backgrounds: Record<NotificationType, string> = {
  success: 'bg-green-500/10 border-green-500/20',
  error: 'bg-red-500/10 border-red-500/20',
  warning: 'bg-yellow-500/10 border-yellow-500/20',
  info: 'bg-blue-500/10 border-blue-500/20',
}

export function ToastContainer() {
  const { notifications, removeNotification } = useNotificationStore()

  return (
    <div className="fixed bottom-4 right-4 z-50 flex flex-col gap-2 max-w-sm">
      <AnimatePresence mode="popLayout">
        {notifications.map((notification) => (
          <motion.div
            key={notification.id}
            initial={{ opacity: 0, y: 20, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, x: 100, scale: 0.95 }}
            transition={{ duration: 0.2 }}
            className={`
              flex items-start gap-3 p-4 rounded-lg border backdrop-blur-sm
              ${backgrounds[notification.type]}
            `}
          >
            <div className="flex-shrink-0 mt-0.5">
              {icons[notification.type]}
            </div>

            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium text-zinc-100">
                {notification.title}
              </p>
              {notification.message && (
                <p className="mt-1 text-sm text-zinc-400 break-words">
                  {notification.message}
                </p>
              )}
              {notification.action && (
                <button
                  onClick={notification.action.onClick}
                  className="mt-2 text-sm font-medium text-blue-400 hover:text-blue-300 transition-colors"
                >
                  {notification.action.label}
                </button>
              )}
            </div>

            <button
              onClick={() => removeNotification(notification.id)}
              className="flex-shrink-0 p-1 rounded hover:bg-zinc-700/50 transition-colors"
            >
              <X className="h-4 w-4 text-zinc-400" />
            </button>
          </motion.div>
        ))}
      </AnimatePresence>
    </div>
  )
}
