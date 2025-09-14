from fastapi import FastAPI, HTTPException, Depends
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse
from pydantic import BaseModel
from typing import List, Optional, Dict, Any
import sys
import os
from dotenv import load_dotenv

# Load environment variables from .env file
load_dotenv()

# Add project root to path
sys.path.append(os.path.join(os.path.dirname(__file__), '..'))

from database.supabase_manager import supabase_manager
from src.preprocessor.json_context_extractor import JSONContextExtractor

# Initialize FastAPI app
app = FastAPI(
    title="Memory System API",
    description="API for managing user memory extraction and review",
    version="1.0.0"
)

# Add CORS middleware
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000", "http://127.0.0.1:3000"],  # React dev server
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Serve static files (React build) - only if build directory exists
static_dir = "frontend/build/static"
if os.path.exists(static_dir):
    app.mount("/static", StaticFiles(directory=static_dir), name="static")

# Global instances
# Note: Supabase manager is initialized in supabase_manager.py
extractor = JSONContextExtractor()

# Pydantic models
class UpdateAction(BaseModel):
    action: str  # "approve" or "reject"
    reviewed_by: str = "ops_user"

class ConcludedFact(BaseModel):
    id: str  # Changed from int to str to accept UUID strings
    user_id: str
    layer: str
    fact_type: str
    conclusion: str  # Human-readable conclusion like "Phone number of Anurag is +91-xxx-xxx-xxxx"
    confidence: float
    evidence: List[Dict[str, Any]]
    status: str
    created_at: str
    raw_value: str

class UserSummary(BaseModel):
    user_id: str
    total_nodes: int
    approved_nodes: int
    pending_nodes: int
    rejected_nodes: int
    layers: Dict[str, int]  # Changed from Dict[str, Dict[str, Any]] to Dict[str, int]

def format_concluded_fact(node: Dict) -> str:
    """Convert raw extracted data into human-readable concluded facts"""
    user_id = node['user_id']
    node_type = node['node_type']
    value = node['value'].get('value', 'N/A') if isinstance(node['value'], dict) else str(node['value'])
    
    # Format different types of facts
    fact_templates = {
        'name': f"Full name of {user_id} is {value}",
        'phone': f"Phone number of {user_id} is {value}",
        'email': f"Email address of {user_id} is {value}",
        'address': f"Address of {user_id} is {value}",
        'age': f"Age of {user_id} is {value} years old",
        'dob': f"Date of birth of {user_id} is {value}",
        'nationality': f"Nationality of {user_id} is {value}",
        'gender': f"Gender of {user_id} is {value}",
        'blood_group': f"Blood group of {user_id} is {value}",
        'relationship_status': f"Relationship status of {user_id} is {value}",
        
        # Layer 2 - Documents
        'aadhaar_number': f"Aadhaar number of {user_id} is {value}",
        'pan_number': f"PAN number of {user_id} is {value}",
        'license_number': f"Driving license number of {user_id} is {value}",
        'voter_id': f"Voter ID of {user_id} is {value}",
        'document_type': f"{user_id} has shared {value} document",
        
        # Layer 3 - Relations
        'family_member': f"{value} is a family member of {user_id}",
        'spouse': f"{value} is the spouse of {user_id}",
        'spouse_name': f"{user_id}'s spouse is {value}",
        'spouse_phone': f"{user_id}'s spouse's phone number is {value}",
        'spouse_email': f"{user_id}'s spouse's email is {value}",
        'friend': f"{value} is a friend of {user_id}",
        'colleague': f"{value} is a colleague of {user_id}",
        'contact_name': f"{value} is a contact of {user_id}",
        'relationship': f"{user_id} has relationship with {value}",
        'contact_phone': f"Contact phone number for {user_id}'s relation is {value}",
        
        # Layer 4 - Preferences
        'food_preference': f"{user_id} prefers {value} food",
        'restaurant_preference': f"{user_id}'s preferred restaurant is {value}",
        'service_provider': f"{user_id} uses {value} as service provider",
        'vendor_name': f"{user_id}'s preferred vendor is {value}",
        'routine': f"{user_id} has routine: {value}",
        'standing_instruction': f"{user_id}'s standing instruction: {value}",
    }
    
    return fact_templates.get(node_type, f"{user_id} has {node_type}: {value}")

# API Routes

@app.get("/")
async def serve_frontend():
    """Serve the React frontend"""
    index_file = "frontend/build/index.html"
    if os.path.exists(index_file):
        return FileResponse(index_file)
    else:
        return {"message": "Memory System API", "status": "running", "note": "Frontend build not found - run 'npm run build' in frontend directory"}

@app.get("/api/health")
async def health_check():
    """Health check endpoint"""
    try:
        supabase_status = supabase_manager.is_connected()
        
        # Test if tables exist by trying a simple query
        tables_exist = True
        error_details = []
        
        if supabase_status:
            try:
                # Test users table
                result = supabase_manager.client.table('users').select('id').limit(1).execute()
                
                # Test memory_nodes table  
                result = supabase_manager.client.table('memory_nodes').select('id').limit(1).execute()
                
            except Exception as e:
                tables_exist = False
                error_details.append(str(e))
        
        return {
            "status": "healthy" if supabase_status and tables_exist else "unhealthy",
            "supabase_connected": supabase_status,
            "tables_exist": tables_exist,
            "database_ready": supabase_status and tables_exist,
            "error_details": error_details if error_details else None,
            "message": "Database tables missing - run the SQL schema in Supabase" if supabase_status and not tables_exist else "System operational"
        }
    except Exception as e:
        return {
            "status": "error",
            "error": str(e),
            "supabase_connected": False,
            "database_ready": False
        }

@app.get("/api/users", response_model=List[str])
async def get_users():
    """Get list of all users"""
    try:
        users = await supabase_manager.get_all_users()
        return users
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.get("/api/users/{user_id}/summary", response_model=UserSummary)
async def get_user_summary(user_id: str):
    """Get summary statistics for a user"""
    try:
        print(f"Getting summary for user: {user_id}")
        summary = await supabase_manager.get_user_summary(user_id)
        print(f"Summary result: {summary}")
        
        return UserSummary(
            user_id=user_id,
            total_nodes=summary.get('total_nodes', 0),
            approved_nodes=summary.get('approved_nodes', 0),
            pending_nodes=summary.get('pending_nodes', 0),
            rejected_nodes=summary.get('rejected_nodes', 0),
            layers=summary.get('layers', {})
        )
    except Exception as e:
        print(f"Error in get_user_summary: {e}")
        import traceback
        traceback.print_exc()
        raise HTTPException(status_code=500, detail=str(e))

@app.get("/api/users/{user_id}/memory", response_model=List[ConcludedFact])
async def get_user_memory(user_id: str, layer: Optional[str] = None):
    """Get consolidated memory graph for a user with concluded facts"""
    try:
        # Parse layer parameter (e.g., "Layer1" -> 1)
        layer_num = None
        if layer and layer.startswith('Layer'):
            try:
                layer_num = int(layer.replace('Layer', ''))
            except ValueError:
                pass
        
        memory_facts = await supabase_manager.get_user_memory_graph(user_id, layer_num)
        
        concluded_facts = []
        for fact in memory_facts:
            concluded_facts.append(ConcludedFact(
                id=fact['id'],
                user_id=user_id,
                layer=fact['layer'],
                fact_type=fact['fact_type'],
                conclusion=fact['conclusion'],
                confidence=fact['confidence'],
                evidence=fact['evidence'],
                status=fact['status'],
                created_at=fact['created_at'],
                raw_value=fact.get('content', 'N/A')
            ))
        
        return concluded_facts
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.get("/api/updates/pending")
async def get_pending_updates(limit: int = 500, layer: Optional[str] = None):
    """Get pending update proposals with concluded facts, optionally filtered by layer"""
    try:
        pending_updates = await supabase_manager.get_pending_updates(limit, layer)
        
        # Enhance with additional metadata for ops review
        enhanced_updates = []
        for update in pending_updates:
            enhanced_update = update.copy()
            
            # Add confidence categorization
            confidence = update.get('confidence', 0)
            if confidence >= 0.9:
                enhanced_update['confidence_level'] = 'high'
            elif confidence >= 0.7:
                enhanced_update['confidence_level'] = 'medium'
            else:
                enhanced_update['confidence_level'] = 'low'
            
            # Add evidence count
            evidence = update.get('evidence', [])
            enhanced_update['evidence_count'] = len(evidence)
            
            # Add extraction method info (will be available after schema update)
            enhanced_update['is_reprocessed'] = False  # Default for now
            
            enhanced_updates.append(enhanced_update)
        
        return {
            "total_pending": len(enhanced_updates),
            "updates": enhanced_updates,
            "summary": {
                "high_confidence": len([u for u in enhanced_updates if u['confidence_level'] == 'high']),
                "medium_confidence": len([u for u in enhanced_updates if u['confidence_level'] == 'medium']),
                "low_confidence": len([u for u in enhanced_updates if u['confidence_level'] == 'low']),
                "reprocessed_items": len([u for u in enhanced_updates if u['is_reprocessed']])
            }
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.post("/api/updates/{update_id}/approve")
async def approve_update(update_id: str, action: UpdateAction):
    """Approve an update proposal"""
    try:
        success = await supabase_manager.approve_update(update_id, action.reviewed_by)
        if success:
            return {"status": "approved", "update_id": update_id}
        else:
            raise HTTPException(status_code=400, detail="Failed to approve update")
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.post("/api/updates/{update_id}/reject")
async def reject_update(update_id: str, action: UpdateAction):
    """Reject an update proposal and trigger re-extraction"""
    try:
        success = await supabase_manager.reject_update(update_id, action.reviewed_by)
        if success:
            # TODO: Implement re-extraction logic here
            # This would involve getting the original context and re-processing
            return {"status": "rejected", "update_id": update_id, "re_extraction": "scheduled"}
        else:
            raise HTTPException(status_code=400, detail="Failed to reject update")
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.get("/api/stats")
async def get_system_stats():
    """Get overall system statistics"""
    try:
        stats = await supabase_manager.get_system_stats()
        return stats
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.post("/api/process/all-jsons")
async def process_all_input_jsons(force_reprocess: bool = False):
    """Process all JSON files in input_jsons/ directory and extract memory facts"""
    try:
        import json
        import os
        from pathlib import Path
        
        input_folder = Path("input_jsons")
        if not input_folder.exists():
            raise HTTPException(status_code=404, detail="input_jsons directory not found")
        
        # Get all JSON files
        json_files = list(input_folder.glob("*.json"))
        if not json_files:
            raise HTTPException(status_code=404, detail="No JSON files found in input_jsons directory")
        
        results = {}
        total_processed = 0
        
        for json_file in json_files:
            try:
                # Extract user ID from filename (remove .json extension)
                user_id = json_file.stem
                
                # Read and process the JSON file
                with open(json_file, 'r', encoding='utf-8') as f:
                    json_data = json.load(f)
                
                # Process with extractor
                extracted_data = await extractor.process_json(json_data, user_id, force_reprocess)
                
                # Count extracted nodes (handle skipped files)
                if extracted_data.get("skipped"):
                    results[user_id] = {
                        "status": "skipped",
                        "message": "Already processed"
                    }
                else:
                    total_nodes = sum(len(nodes) for nodes in extracted_data.values())
                    results[user_id] = {
                        "status": "success",
                        "total_nodes_extracted": total_nodes,
                        "layers": {layer: len(nodes) for layer, nodes in extracted_data.items()}
                    }
                    total_processed += 1
                
            except Exception as e:
                results[user_id] = {
                    "status": "error",
                    "error": str(e)
                }
        
        return {
            "message": f"Processing completed for {len(json_files)} files",
            "total_files_processed": total_processed,
            "results": results
        }
        
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.post("/api/process/json/{user_id}")
async def process_single_json(user_id: str, force_reprocess: bool = False):
    """Process a specific user's JSON file"""
    try:
        import json
        from pathlib import Path
        
        json_file = Path(f"input_jsons/{user_id}.json")
        if not json_file.exists():
            raise HTTPException(status_code=404, detail=f"JSON file for user {user_id} not found")
        
        # Read and process the JSON file
        with open(json_file, 'r', encoding='utf-8') as f:
            json_data = json.load(f)
        
        # Process with extractor (now passing force_reprocess parameter)
        extracted_data = await extractor.process_json(json_data, user_id, force_reprocess)
        
        # Handle skipped files
        if extracted_data.get("skipped"):
            return {
                "user_id": user_id,
                "status": "skipped",
                "message": "Already processed. Use force_reprocess=True to reprocess."
            }
        
        # Count extracted nodes (now contains only newly stored facts)
        total_nodes = sum(len(nodes) for nodes in extracted_data.values())
        
        return {
            "user_id": user_id,
            "status": "success",
            "total_nodes_extracted": total_nodes,
            "layers": {layer: len(nodes) for layer, nodes in extracted_data.items()},
            "extracted_data": extracted_data,  # Contains only facts stored in this iteration
            "note": "extracted_data contains only newly processed facts from this iteration, not historical facts"
        }
        
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.post("/api/reprocess/{node_id}")
async def reprocess_rejected_node(node_id: str):
    """Reprocess a specific rejected memory node by looking in alternative contexts"""
    try:
        # Get the rejected node details
        if not supabase_manager.is_connected():
            raise HTTPException(status_code=503, detail="Database not available")
        
        # Get node details
        result = supabase_manager.client.table('memory_nodes').select('''
            *,
            users!inner(phone_number)
        ''').eq('id', node_id).eq('status', 'rejected').eq('needs_reprocess', True).execute()
        
        if not result.data:
            raise HTTPException(status_code=404, detail="Rejected node not found or not marked for reprocessing")
        
        node = result.data[0]
        user_id = node['users']['phone_number']
        fact_type = node['fact_type']
        layer = f"layer_{node['layer']}"
        
        # Extract message IDs from the original evidence to exclude them
        excluded_message_ids = []
        for evidence_item in node.get('evidence', []):
            if 'message_id' in evidence_item:
                excluded_message_ids.append(evidence_item['message_id'])
        
        # Reprocess using the extractor
        extracted_data = await extractor.reprocess_rejected_fact(
            user_id=user_id,
            fact_type=fact_type,
            layer=layer,
            excluded_message_ids=excluded_message_ids,
            original_node_id=node_id
        )
        
        # Count reprocessed nodes
        total_nodes = sum(len(nodes) for nodes in extracted_data.values())
        
        return {
            "original_node_id": node_id,
            "user_id": user_id,
            "fact_type": fact_type,
            "status": "reprocessed",
            "total_nodes_extracted": total_nodes,
            "reprocessed_data": extracted_data,
            "excluded_contexts": len(excluded_message_ids)
        }
        
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.get("/api/reprocess/candidates")
async def get_reprocessing_candidates():
    """Get all rejected nodes that need reprocessing"""
    try:
        candidates = await supabase_manager.get_rejected_items_for_reprocessing()
        return {
            "total_candidates": len(candidates),
            "candidates": candidates
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000, reload=True)