"""
Supabase client for the Memory System
Replaces PostgreSQL with hosted Supabase database
"""

import os
from supabase import create_client, Client
from typing import List, Dict, Any, Optional
import logging
from datetime import datetime
import json
from dotenv import load_dotenv

# Load environment variables
load_dotenv()

logger = logging.getLogger(__name__)

class SupabaseManager:
    def __init__(self):
        self.supabase_url = os.getenv('SUPABASE_URL')
        self.supabase_key = os.getenv('SUPABASE_ANON_KEY')
        
        if not self.supabase_url or not self.supabase_key:
            logger.error("Supabase credentials not found in environment variables")
            logger.error("Please set SUPABASE_URL and SUPABASE_ANON_KEY")
            self.client = None
            return
            
        try:
            self.client: Client = create_client(self.supabase_url, self.supabase_key)
            logger.info("Supabase client initialized successfully")
        except Exception as e:
            logger.error(f"Failed to initialize Supabase client: {e}")
            self.client = None

    def is_connected(self) -> bool:
        """Check if Supabase client is properly initialized"""
        return self.client is not None

    async def create_user(self, phone_number: str, name: str = None) -> Optional[Dict]:
        """Create or get existing user - bypass RLS by disabling user table dependency"""
        if not self.is_connected():
            logger.error("Supabase client not connected")
            return None
            
        try:
            # Skip user table due to RLS issues - just return mock user
            # Store phone number directly in memory_nodes.user_id field instead
            return {
                'id': phone_number,  # Use phone as ID directly
                'phone_number': phone_number,
                'name': name or phone_number
            }
            
        except Exception as e:
            logger.error(f"Error creating/getting user: {e}")
            return None

    async def store_memory_node(self, user_phone: str, layer: int, fact_type: str, 
                              content: str, concluded_fact: str, confidence: float,
                              evidence: List[Dict], extraction_method: str = 'initial',
                              parent_update_id: str = None) -> Optional[str]:
        """Store a memory node with evidence and return its ID"""
        if not self.is_connected():
            logger.error("Supabase client not connected")
            return None
            
        try:
            # Get user info (bypasses RLS)
            user = await self.create_user(user_phone)
            if not user:
                logger.error(f"Failed to create/get user: {user_phone}")
                return None
            
            # Store memory node with existing schema (use user_id field)
            node_data = {
                'user_id': user['id'],  # This will be the phone number
                'layer': layer,
                'fact_type': fact_type,
                'content': content,
                'concluded_fact': concluded_fact,
                'confidence': confidence,
                'status': 'pending',
                'evidence': evidence,  # Store as JSONB
                'extraction_method': extraction_method,
                'parent_update_id': parent_update_id
            }
            
            result = self.client.table('memory_nodes').insert(node_data).execute()
            
            if result.data:
                logger.info(f"Stored memory node for user {user_phone}: {concluded_fact}")
                return result.data[0]['id']
            else:
                logger.error(f"Failed to store memory node for user {user_phone}")
                return None
            
        except Exception as e:
            logger.error(f"Error storing memory node: {e}")
            return None

    async def get_all_users(self) -> List[str]:
        """Get all unique user phone numbers"""
        if not self.is_connected():
            return []
            
        try:
            result = self.client.table('memory_nodes').select('user_id').execute()
            # Get unique phone numbers from user_id field
            phones = list(set([node['user_id'] for node in result.data]))
            return phones
            
        except Exception as e:
            logger.error(f"Error getting users: {e}")
            return []

    async def get_user_summary(self, user_phone: str) -> Dict:
        """Get memory statistics for a specific user"""
        if not self.is_connected():
            logger.warning("Supabase not connected, returning empty summary")
            return {}
            
        try:
            logger.info(f"Getting user summary for: {user_phone}")
            # Get all memory nodes for this user (using user_id with phone value)
            result = self.client.table('memory_nodes').select('status, layer').eq('user_id', user_phone).execute()
            
            logger.info(f"Found {len(result.data)} memory nodes for {user_phone}")
            
            total_nodes = len(result.data)
            approved_nodes = len([n for n in result.data if n['status'] == 'approved'])
            pending_nodes = len([n for n in result.data if n['status'] == 'pending'])
            rejected_nodes = len([n for n in result.data if n['status'] == 'rejected'])
            
            # Layer distribution
            layers = {}
            for node in result.data:
                layer_key = f"Layer{node['layer']}"
                if layer_key not in layers:
                    layers[layer_key] = 0
                layers[layer_key] += 1
            
            summary = {
                'total_nodes': total_nodes,
                'approved_nodes': approved_nodes,
                'pending_nodes': pending_nodes,
                'rejected_nodes': rejected_nodes,
                'layers': layers
            }
            
            logger.info(f"Summary for {user_phone}: {summary}")
            return summary
            
        except Exception as e:
            logger.error(f"Error getting user summary for {user_phone}: {e}")
            import traceback
            traceback.print_exc()
            return {}
            
        except Exception as e:
            logger.error(f"Error getting user summary: {e}")
            return {}

    async def get_user_memory_graph(self, user_phone: str, layer: Optional[int] = None) -> List[Dict]:
        """Get memory facts for a user, optionally filtered by layer"""
        if not self.is_connected():
            return []
            
        try:
            # Build query using user_id (which stores the phone number)
            query = self.client.table('memory_nodes').select('*').eq('user_id', user_phone)
            
            if layer:
                query = query.eq('layer', layer)
                
            result = query.order('created_at', desc=True).execute()
            
            # Format for frontend
            memory_facts = []
            for node in result.data:
                memory_facts.append({
                    'id': node['id'],
                    'layer': f"Layer{node['layer']}",
                    'fact_type': node['fact_type'],
                    'conclusion': node['concluded_fact'],
                    'confidence': node['confidence'],
                    'status': node['status'],
                    'evidence': node.get('evidence', []),
                    'created_at': node['created_at'],
                    'reviewed_at': node.get('reviewed_at'),
                    'reviewed_by': node.get('reviewed_by')
                })
            
            return memory_facts
            
        except Exception as e:
            logger.error(f"Error getting user memory: {e}")
            return []

    async def get_pending_updates(self, limit: int = 50, layer: Optional[str] = None) -> List[Dict]:
        """Get pending memory updates for ops review, optionally filtered by layer"""
        if not self.is_connected():
            return []
            
        try:
            # Build query with optional layer filter
            query = self.client.table('memory_nodes').select('*').eq('status', 'pending')
            
            # Add layer filter if specified (layer comes as "Layer1", "Layer2", etc.)
            if layer:
                layer_num = int(layer.replace('Layer', ''))
                query = query.eq('layer', layer_num)
            
            result = query.order('created_at', desc=True).limit(limit).execute()
            
            # Format for ops review interface
            pending_updates = []
            for node in result.data:
                pending_updates.append({
                    'id': node['id'],
                    'user_id': node['user_id'],  # Use user_id field
                    'layer': f"Layer{node['layer']}",
                    'fact_type': node['fact_type'],
                    'conclusion': node['concluded_fact'],
                    'confidence': node['confidence'],
                    'evidence': node.get('evidence', []),
                    'created_at': node['created_at'],
                    'status': 'pending'
                })
            
            return pending_updates
            
        except Exception as e:
            logger.error(f"Error getting pending updates: {e}")
            return []

    async def approve_update(self, update_id: str, reviewed_by: str) -> bool:
        """Approve a pending memory update"""
        if not self.is_connected():
            return False
            
        try:
            result = self.client.table('memory_nodes').update({
                'status': 'approved',
                'reviewed_by': reviewed_by,
                'reviewed_at': datetime.utcnow().isoformat()
            }).eq('id', update_id).execute()
            
            success = len(result.data) > 0
            if success:
                logger.info(f"Approved update {update_id} by {reviewed_by}")
            
            return success
            
        except Exception as e:
            logger.error(f"Error approving update: {e}")
            return False

    async def reject_update(self, update_id: str, reviewed_by: str) -> bool:
        """Reject a pending memory update and mark for reprocessing"""
        if not self.is_connected():
            return False
            
        try:
            result = self.client.table('memory_nodes').update({
                'status': 'rejected',
                'needs_reprocess': True,  # Flag for reprocessing
                'reviewed_by': reviewed_by,
                'reviewed_at': datetime.utcnow().isoformat()
            }).eq('id', update_id).execute()
            
            success = len(result.data) > 0
            if success:
                logger.info(f"Rejected update {update_id} by {reviewed_by} - marked for reprocessing")
            
            return success
            
        except Exception as e:
            logger.error(f"Error rejecting update: {e}")
            return False

    async def get_system_stats(self) -> Dict:
        """Get overall system statistics"""
        if not self.is_connected():
            return {}
            
        try:
            # Get total users
            users_result = self.client.table('users').select('id').execute()
            total_users = len(users_result.data)
            
            # Get memory node statistics
            nodes_result = self.client.table('memory_nodes').select('status, layer').execute()
            
            total_facts = len(nodes_result.data)
            approved_facts = len([n for n in nodes_result.data if n['status'] == 'approved'])
            pending_facts = len([n for n in nodes_result.data if n['status'] == 'pending'])
            rejected_facts = len([n for n in nodes_result.data if n['status'] == 'rejected'])
            
            # Calculate acceptance rate
            total_reviewed = approved_facts + rejected_facts
            acceptance_rate = (approved_facts / total_reviewed * 100) if total_reviewed > 0 else 0
            
            # Layer distribution
            layer_distribution = {}
            for node in nodes_result.data:
                layer_key = f"Layer{node['layer']}"
                if layer_key not in layer_distribution:
                    layer_distribution[layer_key] = 0
                layer_distribution[layer_key] += 1
            
            return {
                'total_users': total_users,
                'total_facts': total_facts,
                'approved_facts': approved_facts,
                'pending_facts': pending_facts,
                'rejected_facts': rejected_facts,
                'acceptance_rate': round(acceptance_rate, 1),
                'layer_distribution': layer_distribution
            }
            
        except Exception as e:
            logger.error(f"Error getting system stats: {e}")
            return {}

    async def get_rejected_items_for_reprocessing(self, limit: int = 50) -> List[Dict]:
        """Get rejected memory nodes that need reprocessing"""
        if not self.is_connected():
            return []
            
        try:
            result = self.client.table('memory_nodes').select('''
                *,
                users!inner(phone_number)
            ''').eq('status', 'rejected').eq('needs_reprocess', True).order('created_at', desc=True).limit(limit).execute()
            
            # Format for reprocessing
            rejected_items = []
            for node in result.data:
                rejected_items.append({
                    'id': node['id'],
                    'user_id': node['users']['phone_number'],
                    'layer': node['layer'],
                    'fact_type': node['fact_type'],
                    'content': node['content'],
                    'concluded_fact': node['concluded_fact'],
                    'confidence': node['confidence'],
                    'evidence': node.get('evidence', []),
                    'created_at': node['created_at'],
                    'rejected_at': node.get('reviewed_at'),
                    'parent_update_id': node.get('parent_update_id')
                })
            
            return rejected_items
            
        except Exception as e:
            logger.error(f"Error getting rejected items: {e}")
            return []

    async def mark_reprocessing_complete(self, update_id: str) -> bool:
        """Mark a rejected item as reprocessed (no longer needs reprocessing)"""
        if not self.is_connected():
            return False
            
        try:
            result = self.client.table('memory_nodes').update({
                'needs_reprocess': False
            }).eq('id', update_id).execute()
            
            success = len(result.data) > 0
            if success:
                logger.info(f"Marked {update_id} as reprocessed")
            
            return success
            
        except Exception as e:
            logger.error(f"Error marking reprocessing complete: {e}")
            return False

    async def get_user_contexts_excluding_evidence(self, user_phone: str, excluded_evidence: List[str]) -> List[Dict]:
        """Get all contexts for a user excluding specific message IDs (for reprocessing)"""
        if not self.is_connected():
            return []
            
        try:
            # Get user
            user_result = self.client.table('users').select('id').eq('phone_number', user_phone).execute()
            if not user_result.data:
                return []
            
            # Get all memory nodes for this user to extract their evidence
            result = self.client.table('memory_nodes').select('evidence').eq('user_id', user_result.data[0]['id']).execute()
            
            all_contexts = []
            for node in result.data:
                evidence = node.get('evidence', [])
                for evidence_item in evidence:
                    # Only include contexts that don't contain excluded message IDs
                    message_id = evidence_item.get('message_id')
                    if message_id and message_id not in excluded_evidence:
                        all_contexts.append(evidence_item)
            
            return all_contexts
            
        except Exception as e:
            logger.error(f"Error getting user contexts: {e}")
            return []

    def log_extraction_fallback(self, user_phone: str, layer: int, fact_type: str,
                               concluded_fact: str, confidence: float, evidence: List[Dict]):
        """Fallback logging when Supabase is unavailable"""
        log_entry = {
            'timestamp': datetime.utcnow().isoformat(),
            'user_phone': user_phone,
            'layer': layer,
            'fact_type': fact_type,
            'concluded_fact': concluded_fact,
            'confidence': confidence,
            'evidence': evidence,
            'status': 'pending',
            'source': 'supabase_fallback'
        }
        
        try:
            with open('memory_extractions.log', 'a', encoding='utf-8') as f:
                f.write(json.dumps(log_entry, ensure_ascii=False) + '\n')
        except Exception as e:
            logger.error(f"Failed to write fallback log: {e}")

    async def is_file_processed(self, user_id: str) -> bool:
        """Check if a JSON file has already been processed"""
        if not self.is_connected():
            return False
            
        try:
            result = self.client.table('processed_files').select('*').eq('user_id', user_id).execute()
            return len(result.data) > 0
        except Exception as e:
            logger.error(f"Error checking if file processed: {e}")
            return False

    async def mark_file_processed(self, user_id: str, total_nodes_extracted: int) -> bool:
        """Mark a JSON file as processed"""
        if not self.is_connected():
            return False
            
        try:
            data = {
                'user_id': user_id,
                'processed_at': datetime.now().isoformat(),
                'total_nodes_extracted': total_nodes_extracted,
                'status': 'completed'
            }
            
            # Use upsert to handle re-processing scenarios
            result = self.client.table('processed_files').upsert(data).execute()
            
            if result.data:
                logger.info(f"Marked {user_id} as processed with {total_nodes_extracted} nodes")
                return True
            return False
        except Exception as e:
            logger.error(f"Error marking file as processed: {e}")
            return False

    async def mark_file_unprocessed(self, user_id: str) -> bool:
        """Mark a JSON file as unprocessed (for reprocessing)"""
        if not self.is_connected():
            return False
            
        try:
            result = self.client.table('processed_files').delete().eq('user_id', user_id).execute()
            logger.info(f"Marked {user_id} as unprocessed for reprocessing")
            return True
        except Exception as e:
            logger.error(f"Error marking file as unprocessed: {e}")
            return False

# Global instance
supabase_manager = SupabaseManager()