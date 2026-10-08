// Every test starts from a clean slate: nothing the machine running the tests happens to have set may leak in.
// (Plenty of machines have ANTHROPIC_BASE_URL or a platform's own variables set for their own use.)
for (const k of ['ANTHROPIC_API_KEY', 'ANTHROPIC_BASE_URL', 'ANTHROPIC_WORKSPACE_ID', 'NETLIFY_AI_GATEWAY_KEY', 'NETLIFY_AI_GATEWAY_URL', 'NETLIFY_AI_GATEWAY_BASE_URL',
  'HOST_OFF', 'HOST_MODEL', 'HOST_CREDITS_PER_DAY', 'HOST_CREDITS_PER_MONTH', 'THOUGHTS_ADMIN_KEY', 'THOUGHTS_SECRET', 'THOUGHTS_PER_IP_MAX', 'THOUGHTS_PER_HOUR_MAX', 'THOUGHTS_PER_IP_PER_DAY', 'SHARED_ADDRESS_RANGES', 'ROOM_CLOSED', 'HOST_REQUIRED',
  'NETLIFY_BLOBS_CONTEXT', 'NETLIFY', 'NETLIFY_DEV', 'URL', 'AWS_LAMBDA_FUNCTION_NAME', 'LAMBDA_TASK_ROOT']) delete process.env[k];
