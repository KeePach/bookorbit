import { beforeEach, describe, expect, it } from 'vitest'
import { mount } from '@vue/test-utils'
import { RELEASE_COLORS_STORAGE_KEY, reloadReleaseColors, useReleaseColors } from '../composables/useReleaseColors'
import ReleaseColorsCard from './ReleaseColorsCard.vue'

describe('ReleaseColorsCard', () => {
  beforeEach(() => {
    localStorage.removeItem(RELEASE_COLORS_STORAGE_KEY)
    reloadReleaseColors()
  })

  it('lists every status, finished hidden by default', () => {
    const wrapper = mount(ReleaseColorsCard)
    expect(wrapper.findAll('li')).toHaveLength(8)
    expect(wrapper.find('[data-testid="release-color-finished"] [role="switch"]').attributes('aria-checked')).toBe('false')
    expect(wrapper.find('[data-testid="release-colors-reset-all"]').exists()).toBe(false)
  })

  it('changes a color, the line style and visibility, then resets them', async () => {
    const wrapper = mount(ReleaseColorsCard)
    const row = wrapper.find('[data-testid="release-color-caughtUp"]')
    await row.find('input[type="color"]').setValue('#10b981')
    await row.find('input[type="checkbox"]').setValue(false)
    await row.find('[role="switch"]').trigger('click')
    expect(useReleaseColors().looks.value.caughtUp).toEqual({ color: '#10b981', dashed: false, visible: false })

    await wrapper.find('[data-testid="release-colors-reset-all"]').trigger('click')
    expect(useReleaseColors().isDefault('caughtUp')).toBe(true)
  })
})
