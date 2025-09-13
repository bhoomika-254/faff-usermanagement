# Memory System Frontend

A React-based operations interface for reviewing and approving extracted memory facts from WhatsApp conversations.

## Features

- **Dashboard**: System-wide statistics and health monitoring
- **Users Overview**: List of all users with memory statistics
- **User Memory**: Detailed view of individual user's memory graph with concluded facts
- **Pending Updates**: Review and approve/reject extracted facts
- **Layer Filtering**: Filter memory facts by 4-layer system (personal info, documents, relations, preferences)

## Setup and Installation

### Prerequisites
- Node.js (v14+ recommended)
- npm or yarn
- Running backend API (FastAPI server on port 8000)

### Installation

1. Navigate to the frontend directory:
```bash
cd frontend
```

2. Install dependencies:
```bash
npm install
```

3. Start the development server:
```bash
npm start
```

The app will open at `http://localhost:3000`

### Environment Variables

Create a `.env` file in the frontend directory:

```
REACT_APP_API_URL=http://localhost:8000/api
```

## Project Structure

```
frontend/
├── public/                 # Static assets
├── src/
│   ├── components/        # React components
│   │   ├── Dashboard.js   # Main dashboard with stats
│   │   ├── UsersOverview.js # Users table with navigation
│   │   ├── UserMemory.js  # Individual user memory view
│   │   ├── PendingUpdates.js # Review interface
│   │   ├── Navigation.js  # Top navigation bar
│   │   └── Sidebar.js     # Side navigation
│   ├── services/
│   │   └── api.js         # API service layer
│   ├── styles/
│   │   └── App.css        # Custom CSS styles
│   ├── App.js             # Main app with routing
│   └── index.js           # Entry point
├── package.json
└── README.md
```

## Key Components

### Dashboard
- System health monitoring
- Total users and memory facts
- Approval statistics and acceptance rate
- Quick navigation to pending updates

### Users Overview
- Table of all users with memory statistics
- Links to individual user memory graphs
- Statistics by approval status (approved/pending/rejected)
- Layer distribution information

### User Memory
- Detailed view of individual user's concluded facts
- Layer-based filtering (Layer1-4)
- Confidence scoring with visual indicators
- Evidence viewing with message snippets
- Status indicators (approved/pending/rejected)

### Pending Updates
- Review interface for new extracted facts
- Concluded facts format: "Phone number of Anurag is +91-xxx-xxx-xxxx"
- Evidence viewing with message context
- Approve/reject actions with reviewer tracking

## API Integration

The frontend communicates with the FastAPI backend through:

- `/api/users` - Get all users
- `/api/users/{userId}/summary` - User statistics
- `/api/users/{userId}/memory` - User memory facts (with optional layer filter)
- `/api/updates/pending` - Pending facts for review
- `/api/updates/{updateId}/approve` - Approve fact
- `/api/updates/{updateId}/reject` - Reject fact
- `/api/stats` - System statistics

## Styling

- Bootstrap 5 for responsive design
- React Bootstrap components
- Custom CSS for memory-specific styling
- Dark mode support
- Mobile-responsive design

## Development

### Available Scripts

- `npm start` - Start development server
- `npm build` - Build for production
- `npm test` - Run tests
- `npm eject` - Eject from Create React App

### Adding New Features

1. Create new components in `src/components/`
2. Add API endpoints to `src/services/api.js`
3. Update routing in `App.js`
4. Add navigation links in `Sidebar.js`

## Deployment

Build the production version:
```bash
npm run build
```

The built files will be in the `build/` directory, ready for deployment to any static hosting service.

## Backend Requirements

This frontend expects a FastAPI backend with the following endpoints:
- Health check endpoint
- User management endpoints
- Memory retrieval endpoints
- Update approval endpoints
- System statistics endpoints

See the backend documentation for API specifications.