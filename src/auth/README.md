# Edgework SDK Auth

This module provides authentication and authorization services for the Edgework SDK, with a focus on UCAN (User Controlled Authorization Networks) integration.

## Usage

```typescript
import { EdgeworkAuth } from '@edgework/sdk/auth';

const auth = new EdgeworkAuth();
await auth.login('your-token');
const session = await auth.getSession();
```

## Features

- **Session Management**: Handle user sessions and identities.
- **Capabilities**: (Planned) Manage UCAN capabilities.
- **UCAN Integration**: (Pending) Full integration with `shared-ui/services/pensieve/ucan`.

## Status

**Current Status**: Placeholder Implementation.
The current implementation provides a basic structure for authentication but does not yet implement full UCAN verification logic.

Last Updated: 2026-01-31