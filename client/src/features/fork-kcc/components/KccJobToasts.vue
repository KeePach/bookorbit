<script setup lang="ts">
import { onMounted } from 'vue'
import { usePermissions } from '@/features/auth/composables/usePermissions'
import { kccApi } from '../lib/kcc-api'
import { trackKccJob } from '../lib/kcc-job-tracker'

/** After a reload, brings back the corner notice for KCC conversions still running on the server. */
const { hasPermission } = usePermissions()

onMounted(async () => {
  if (!hasPermission('library_edit_metadata')) return
  try {
    for (const job of await kccApi.activeJobs()) trackKccJob(job)
  } catch {
    // KCC not set up or BookOrbit unreachable: nothing to show.
  }
})
</script>

<template>
  <span hidden />
</template>
