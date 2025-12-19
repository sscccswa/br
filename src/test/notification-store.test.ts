import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { useNotificationStore, notify, Notification } from '../renderer/stores/notification-store'

describe('NotificationStore', () => {
  beforeEach(() => {
    // Reset the store before each test
    useNotificationStore.setState({ notifications: [] })
    vi.useFakeTimers()
  })

  afterEach(() => {
    vi.restoreAllMocks()
    vi.useRealTimers()
  })

  describe('addNotification', () => {
    it('should add a notification with unique id', () => {
      const id = useNotificationStore.getState().addNotification({
        type: 'info',
        title: 'Test Notification',
      })

      const store = useNotificationStore.getState()
      expect(id).toMatch(/^notification-\d+$/)
      expect(store.notifications).toHaveLength(1)
      expect(store.notifications[0]).toMatchObject({
        id,
        type: 'info',
        title: 'Test Notification',
      })
    })

    it('should add notification with default duration of 5000ms', () => {
      useNotificationStore.getState().addNotification({
        type: 'info',
        title: 'Test',
      })

      const store = useNotificationStore.getState()
      expect(store.notifications[0].duration).toBe(5000)
    })

    it('should add notification with custom duration', () => {
      useNotificationStore.getState().addNotification({
        type: 'info',
        title: 'Test',
        duration: 3000,
      })

      const store = useNotificationStore.getState()
      expect(store.notifications[0].duration).toBe(3000)
    })

    it('should add notification with persistent duration (0)', () => {
      useNotificationStore.getState().addNotification({
        type: 'info',
        title: 'Test',
        duration: 0,
      })

      const store = useNotificationStore.getState()
      expect(store.notifications[0].duration).toBe(0)
    })

    it('should add notification with message', () => {
      useNotificationStore.getState().addNotification({
        type: 'success',
        title: 'Success',
        message: 'Operation completed successfully',
      })

      const store = useNotificationStore.getState()
      expect(store.notifications[0].message).toBe('Operation completed successfully')
    })

    it('should add notification with action', () => {
      const actionFn = vi.fn()

      useNotificationStore.getState().addNotification({
        type: 'info',
        title: 'Test',
        action: {
          label: 'Click me',
          onClick: actionFn,
        },
      })

      const store = useNotificationStore.getState()
      expect(store.notifications[0].action).toBeDefined()
      expect(store.notifications[0].action?.label).toBe('Click me')

      // Call the action
      store.notifications[0].action?.onClick()
      expect(actionFn).toHaveBeenCalledTimes(1)
    })

    it('should add multiple notifications', () => {
      const id1 = useNotificationStore.getState().addNotification({ type: 'info', title: 'First' })
      const id2 = useNotificationStore.getState().addNotification({ type: 'success', title: 'Second' })
      const id3 = useNotificationStore.getState().addNotification({ type: 'error', title: 'Third' })

      const store = useNotificationStore.getState()
      expect(store.notifications).toHaveLength(3)
      expect(id1).not.toBe(id2)
      expect(id2).not.toBe(id3)
    })

    it('should auto-remove notification after duration', () => {
      useNotificationStore.getState().addNotification({
        type: 'info',
        title: 'Test',
        duration: 5000,
      })

      expect(useNotificationStore.getState().notifications).toHaveLength(1)

      // Fast-forward time by 5000ms
      vi.advanceTimersByTime(5000)

      expect(useNotificationStore.getState().notifications).toHaveLength(0)
    })

    it('should not auto-remove persistent notifications (duration 0)', () => {
      useNotificationStore.getState().addNotification({
        type: 'info',
        title: 'Persistent',
        duration: 0,
      })

      expect(useNotificationStore.getState().notifications).toHaveLength(1)

      // Fast-forward time
      vi.advanceTimersByTime(10000)

      expect(useNotificationStore.getState().notifications).toHaveLength(1)
    })

    it('should handle multiple notifications with different durations', () => {
      useNotificationStore.getState().addNotification({ type: 'info', title: 'Short', duration: 1000 })
      useNotificationStore.getState().addNotification({ type: 'info', title: 'Medium', duration: 3000 })
      useNotificationStore.getState().addNotification({ type: 'info', title: 'Long', duration: 5000 })

      expect(useNotificationStore.getState().notifications).toHaveLength(3)

      // After 1000ms, first should be removed
      vi.advanceTimersByTime(1000)
      expect(useNotificationStore.getState().notifications).toHaveLength(2)
      expect(useNotificationStore.getState().notifications[0].title).toBe('Medium')

      // After another 2000ms (total 3000ms), second should be removed
      vi.advanceTimersByTime(2000)
      expect(useNotificationStore.getState().notifications).toHaveLength(1)
      expect(useNotificationStore.getState().notifications[0].title).toBe('Long')

      // After another 2000ms (total 5000ms), third should be removed
      vi.advanceTimersByTime(2000)
      expect(useNotificationStore.getState().notifications).toHaveLength(0)
    })
  })

  describe('removeNotification', () => {
    it('should remove notification by id', () => {
      const id1 = useNotificationStore.getState().addNotification({ type: 'info', title: 'First' })
      const id2 = useNotificationStore.getState().addNotification({ type: 'info', title: 'Second' })
      const id3 = useNotificationStore.getState().addNotification({ type: 'info', title: 'Third' })

      expect(useNotificationStore.getState().notifications).toHaveLength(3)

      useNotificationStore.getState().removeNotification(id2)

      const updatedStore = useNotificationStore.getState()
      expect(updatedStore.notifications).toHaveLength(2)
      expect(updatedStore.notifications.find(n => n.id === id1)).toBeDefined()
      expect(updatedStore.notifications.find(n => n.id === id2)).toBeUndefined()
      expect(updatedStore.notifications.find(n => n.id === id3)).toBeDefined()
    })

    it('should handle removing non-existent notification', () => {
      useNotificationStore.getState().addNotification({ type: 'info', title: 'Test' })
      expect(useNotificationStore.getState().notifications).toHaveLength(1)

      useNotificationStore.getState().removeNotification('non-existent-id')

      expect(useNotificationStore.getState().notifications).toHaveLength(1)
    })

    it('should handle removing from empty store', () => {
      expect(useNotificationStore.getState().notifications).toHaveLength(0)

      useNotificationStore.getState().removeNotification('some-id')

      expect(useNotificationStore.getState().notifications).toHaveLength(0)
    })
  })

  describe('clearAll', () => {
    it('should remove all notifications', () => {
      useNotificationStore.getState().addNotification({ type: 'info', title: 'First' })
      useNotificationStore.getState().addNotification({ type: 'success', title: 'Second' })
      useNotificationStore.getState().addNotification({ type: 'error', title: 'Third' })

      expect(useNotificationStore.getState().notifications).toHaveLength(3)

      useNotificationStore.getState().clearAll()

      expect(useNotificationStore.getState().notifications).toHaveLength(0)
    })

    it('should handle clearing empty store', () => {
      expect(useNotificationStore.getState().notifications).toHaveLength(0)

      useNotificationStore.getState().clearAll()

      expect(useNotificationStore.getState().notifications).toHaveLength(0)
    })
  })

  describe('notify helper functions', () => {
    beforeEach(() => {
      useNotificationStore.setState({ notifications: [] })
    })

    describe('notify.success', () => {
      it('should add success notification with title', () => {
        const id = notify.success('Success!')
        const store = useNotificationStore.getState()

        expect(store.notifications).toHaveLength(1)
        expect(store.notifications[0]).toMatchObject({
          id,
          type: 'success',
          title: 'Success!',
          duration: 5000,
        })
      })

      it('should add success notification with title and message', () => {
        const id = notify.success('Success!', 'Operation completed')
        const store = useNotificationStore.getState()

        expect(store.notifications[0]).toMatchObject({
          type: 'success',
          title: 'Success!',
          message: 'Operation completed',
        })
      })
    })

    describe('notify.error', () => {
      it('should add error notification with 8000ms duration', () => {
        const id = notify.error('Error!')
        const store = useNotificationStore.getState()

        expect(store.notifications).toHaveLength(1)
        expect(store.notifications[0]).toMatchObject({
          id,
          type: 'error',
          title: 'Error!',
          duration: 8000,
        })
      })

      it('should add error notification with title and message', () => {
        notify.error('Error!', 'Something went wrong')
        const store = useNotificationStore.getState()

        expect(store.notifications[0]).toMatchObject({
          type: 'error',
          title: 'Error!',
          message: 'Something went wrong',
        })
      })
    })

    describe('notify.warning', () => {
      it('should add warning notification', () => {
        const id = notify.warning('Warning!')
        const store = useNotificationStore.getState()

        expect(store.notifications).toHaveLength(1)
        expect(store.notifications[0]).toMatchObject({
          id,
          type: 'warning',
          title: 'Warning!',
          duration: 5000,
        })
      })

      it('should add warning notification with message', () => {
        notify.warning('Warning!', 'Please be careful')
        const store = useNotificationStore.getState()

        expect(store.notifications[0].message).toBe('Please be careful')
      })
    })

    describe('notify.info', () => {
      it('should add info notification', () => {
        const id = notify.info('Info')
        const store = useNotificationStore.getState()

        expect(store.notifications).toHaveLength(1)
        expect(store.notifications[0]).toMatchObject({
          id,
          type: 'info',
          title: 'Info',
          duration: 5000,
        })
      })

      it('should add info notification with message', () => {
        notify.info('Info', 'Additional details')
        const store = useNotificationStore.getState()

        expect(store.notifications[0].message).toBe('Additional details')
      })
    })

    it('should create different notification types', () => {
      notify.success('Success')
      notify.error('Error')
      notify.warning('Warning')
      notify.info('Info')

      const store = useNotificationStore.getState()
      expect(store.notifications).toHaveLength(4)
      expect(store.notifications[0].type).toBe('success')
      expect(store.notifications[1].type).toBe('error')
      expect(store.notifications[2].type).toBe('warning')
      expect(store.notifications[3].type).toBe('info')
    })
  })

  describe('notification types', () => {
    it('should support all notification types', () => {
      useNotificationStore.getState().addNotification({ type: 'success', title: 'Success' })
      useNotificationStore.getState().addNotification({ type: 'error', title: 'Error' })
      useNotificationStore.getState().addNotification({ type: 'warning', title: 'Warning' })
      useNotificationStore.getState().addNotification({ type: 'info', title: 'Info' })

      const store = useNotificationStore.getState()
      expect(store.notifications).toHaveLength(4)
      expect(store.notifications.map(n => n.type)).toEqual([
        'success',
        'error',
        'warning',
        'info',
      ])
    })
  })
})
