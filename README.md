# FAFF Memory System

A comprehensive memory extraction and management system that processes WhatsApp chat data to extract and organize user information using AI.

## Features

- **JSON Processing**: Upload and process WhatsApp chat JSON files
- **AI-Powered Extraction**: Uses Anthropic's Claude to extract meaningful information
- **Memory Management**: Stores and organizes extracted facts in layers
- **Interactive Dashboard**: React-based frontend for easy interaction
- **Fact Approval System**: Review and approve extracted information

## How to Use

1. **Dashboard**: Use the main dashboard to process JSON files
2. **Information Graph**: View extracted and organized user information
3. **Upload JSON**: Process WhatsApp chat exports in JSON format

## Architecture

- **Frontend**: React.js with Bootstrap UI
- **Backend**: FastAPI with Python
- **Database**: Supabase for data storage
- **AI**: Anthropic Claude for information extraction

## Environment Variables

The application requires these environment variables:
- `SUPABASE_URL`: Your Supabase project URL
- `SUPABASE_KEY`: Your Supabase API key
- `ANTHROPIC_API_KEY`: Your Anthropic API key

## Development

This application is designed to extract structured information from conversational data and organize it into meaningful user profiles and preferences.