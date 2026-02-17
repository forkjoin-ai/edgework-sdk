# Edgework React Integration

React components and hooks for integrating Edgework SDK into React applications.

## Purpose

Provides a React Provider and UI components to easily use Edgework inference and RLHF capabilities in React apps.

## Key Components

- **EdgeworkProvider** (`EdgeworkContext.tsx`): Context provider that manages SDK initialization.
- **ModelStatus** (`ModelStatus.tsx`): Component to display model download progress and status.
- **FeedbackPanel** (`FeedbackPanel.tsx`): UI for collecting RLHF feedback from users.
- **FeedbackButton** (`FeedbackButton.tsx`): Simple thumbs up/down button.

## Usage

```tsx
import { EdgeworkProvider, useEdgework } from '@affectively/edgework-sdk/react';

function App() {
  return (
    <EdgeworkProvider model="cyrano-360m">
      <Chat />
    </EdgeworkProvider>
  );
}

function Chat() {
  const { generate } = useEdgework();
  // ...
}
```

Last Updated: 2026-01-31