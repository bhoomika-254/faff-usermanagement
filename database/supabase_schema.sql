-- Memory System Database Schema for Supabase
-- Run this SQL in your Supabase SQL Editor

-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Users table
CREATE TABLE users (
    id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
    phone_number VARCHAR(20) UNIQUE NOT NULL,
    name VARCHAR(100),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Memory nodes table
CREATE TABLE memory_nodes (
    id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
    user_id UUID REFERENCES users(id) ON DELETE CASCADE,
    layer INTEGER NOT NULL CHECK (layer IN (1, 2, 3, 4)),
    fact_type VARCHAR(100) NOT NULL,
    content TEXT NOT NULL,
    concluded_fact TEXT NOT NULL, -- Human readable conclusion like "Phone number of Anurag is +91-xxx"
    confidence DECIMAL(3,2) NOT NULL CHECK (confidence >= 0 AND confidence <= 1),
    status VARCHAR(20) DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected')),
    evidence JSONB NOT NULL DEFAULT '[]', -- Store evidence as JSON array
    needs_reprocess BOOLEAN DEFAULT FALSE, -- Flag for rejected items that need reprocessing
    parent_update_id UUID REFERENCES memory_nodes(id), -- Link to original node for reprocessing attempts
    extraction_method VARCHAR(50) DEFAULT 'initial' CHECK (extraction_method IN ('initial', 'reprocess')), -- Track how this node was created
    reviewed_by VARCHAR(100),
    reviewed_at TIMESTAMP WITH TIME ZONE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Indexes for performance
CREATE INDEX idx_memory_nodes_user_id ON memory_nodes(user_id);
CREATE INDEX idx_memory_nodes_layer ON memory_nodes(layer);
CREATE INDEX idx_memory_nodes_status ON memory_nodes(status);
CREATE INDEX idx_memory_nodes_needs_reprocess ON memory_nodes(needs_reprocess);
CREATE INDEX idx_memory_nodes_parent_update_id ON memory_nodes(parent_update_id);
CREATE INDEX idx_memory_nodes_created_at ON memory_nodes(created_at DESC);
CREATE INDEX idx_users_phone_number ON users(phone_number);

-- Enable Row Level Security (RLS)
ALTER TABLE users ENABLE ROW LEVEL SECURITY;
ALTER TABLE memory_nodes ENABLE ROW LEVEL SECURITY;

-- Policies for authenticated access (adjust based on your auth strategy)
-- For now, allow all operations for authenticated users
CREATE POLICY "Allow all operations for authenticated users" ON users 
    FOR ALL USING (auth.role() = 'authenticated');

CREATE POLICY "Allow all operations for authenticated users" ON memory_nodes 
    FOR ALL USING (auth.role() = 'authenticated');

-- Or use service role for backend operations (recommended for your use case)
-- You can also create policies that allow service role access:
CREATE POLICY "Allow service role full access" ON users 
    FOR ALL USING (auth.jwt() ->> 'role' = 'service_role');

CREATE POLICY "Allow service role full access" ON memory_nodes 
    FOR ALL USING (auth.jwt() ->> 'role' = 'service_role');

-- Function to update updated_at timestamp
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ language 'plpgsql';

-- Triggers to automatically update updated_at
CREATE TRIGGER update_users_updated_at BEFORE UPDATE ON users 
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_memory_nodes_updated_at BEFORE UPDATE ON memory_nodes 
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- Sample data for testing (optional)
-- INSERT INTO users (phone_number, name) VALUES 
--     ('+91-9876543210', 'Anurag'),
--     ('+91-9876543211', 'Gaurav'),
--     ('+91-9876543212', 'Aditya');

-- Sample memory node (optional)
-- INSERT INTO memory_nodes (user_id, layer, fact_type, content, concluded_fact, confidence, evidence) 
-- SELECT 
--     u.id,
--     1,
--     'contact_information',
--     'Phone number shared in conversation',
--     'Phone number of Anurag is +91-9876543210',
--     0.95,
--     '[{"message_id": "msg_123", "snippet": "my number is +91-9876543210"}]'::jsonb
-- FROM users u WHERE u.phone_number = '+91-9876543210';