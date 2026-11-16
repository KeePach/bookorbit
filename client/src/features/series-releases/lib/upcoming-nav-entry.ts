import { CalendarClock } from '@lucide/vue'
import type { SidebarNavEntry } from '@/composables/useSidebarNav'

/**
 * The Upcoming page's place in the sidebar's Browse section, next to Authors and Series. It lives
 * here so the shared sidebar list only has to import it.
 */
export const upcomingNavEntry: SidebarNavEntry = {
  id: 'series-releases',
  labelKey: 'seriesReleases.agenda.title',
  icon: CalendarClock,
  zone: 'browse',
  to: { name: 'series-releases' },
  isActive: (route) => route.name === 'series-releases',
}
