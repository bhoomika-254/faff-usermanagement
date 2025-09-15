import json
import re
import os
import sys
from typing import Dict, List, Any
from collections import defaultdict
from fuzzywuzzy import fuzz  # For fuzzy deduplication; pip install fuzzywuzzy python-Levenshtein
import anthropic
from dotenv import load_dotenv

# Add the project root to the path
sys.path.append(os.path.join(os.path.dirname(__file__), '..', '..'))
from database.supabase_manager import supabase_manager

# Load environment variables
load_dotenv()

class JSONContextExtractor:
    def __init__(self, chunk_size: int = 100, overlap_size: int = 20):
        self.chunk_size = chunk_size
        self.overlap_size = overlap_size
        
        # Initialize Anthropic client
        self.anthropic_client = anthropic.Anthropic(
            api_key=os.getenv("ANTHROPIC_API_KEY")
        )
        
        # Set default model name
        self.model_name = "claude-3-5-sonnet-20240620"
        
        # Test Supabase connection
        if not supabase_manager.is_connected():
            print("⚠️  Supabase connection failed. Operations will be logged only.")
            self.db_enabled = False
        else:
            print("✅ Supabase connection successful.")
            self.db_enabled = True

    def chunk_messages(self, messages: List[Dict[str, str]]) -> List[List[Dict[str, str]]]:
        """Split messages into overlapping chunks for LLM processing"""
        if not messages:
            return []
            
        chunks = []
        for i in range(0, len(messages), self.chunk_size - self.overlap_size):
            chunk = messages[i:i + self.chunk_size]
            if chunk:
                chunks.append(chunk)
            
            # Stop if we've reached the end
            if i + self.chunk_size >= len(messages):
                break
                
        return chunks

    def deduplicate_messages(self, messages: List[Dict]) -> List[Dict]:
        """Remove duplicate messages within a context using fuzzy matching"""
        seen = set()
        deduped = []
        for msg in messages:
            text = msg.get("message", "").strip().lower()
            if text:
                is_duplicate = any(fuzz.ratio(text, s) > 95 for s in seen)
                if not is_duplicate:
                    seen.add(text)
                    deduped.append(msg)
        return deduped

    def prepare_comprehensive_llm_prompt(self, chunk: List[Dict[str, str]], user_id: str) -> str:
        """Prepare prompt for comprehensive LLM extraction from message chunk with ownership validation"""
        deduped_chunk = self.deduplicate_messages(chunk)
        context_text = "\n".join([
            f"[{msg.get('id', i)}] {msg.get('sender', 'Unknown')}: {msg.get('message', '')}" 
            for i, msg in enumerate(deduped_chunk)
        ])
        
        prompt = f"""
You are an expert information extractor for a personal assistant memory system. Extract ONLY personal information that specifically belongs to or is claimed by the target user "{user_id}".

TARGET USER: {user_id}

CONVERSATION CHUNK:
{context_text}

CRITICAL OWNERSHIP VALIDATION RULES:
1. ONLY extract information that is specifically ABOUT {user_id} or claimed BY {user_id}
2. REJECT information about other people, temporary locations, or general mentions
3. REQUIRE clear ownership indicators like "my", "I am", "I live", "my name is", etc.
4. REJECT casual mentions that don't indicate personal ownership
5. If unclear who the information belongs to, DO NOT extract it

VALID OWNERSHIP PATTERNS:
✅ "{user_id} says: My address is..."
✅ "I live at..." (when {user_id} is speaking)
✅ "My phone number is..." (when {user_id} is speaking)  
✅ "I was born in..." (when {user_id} is speaking)
✅ "My wife/husband is..." (when {user_id} is speaking)

INVALID PATTERNS TO REJECT:
❌ "Let's meet at Mumbai" (temporary location, not personal address)
❌ "The office is in Bandra" (not personal address)
❌ "She lives in..." (someone else's information)
❌ Any location mentioned without clear personal ownership
❌ Business addresses, meeting locations, casual place mentions

MEMORY LAYERS TO EXTRACT (ONLY IF CLEARLY OWNED BY {user_id}):

LAYER 1 - Basic Personal Information (HIGHEST PRIORITY):
- Full names, ages, date of birth, nationality, gender, blood group (ONLY if about {user_id})
- Phone numbers, email addresses (ONLY if stated as THEIR contact info)
- Home addresses (ONLY if clearly stated as THEIR home/personal address)
- Relationship status, occupation, company details (ONLY if {user_id}'s info)
- Work location, car model, Work Address comes under LAYER 1

LAYER 2 - Document Information (HIGH PRIORITY):
- DONT EXTRACT INFORMATION IF IT IS NOT CLEARLY DESCRIBED. For example, user mentions about the aadhar card, but doesn't have any aadhar card ID/details, Then DONT EXTRACT
- Government IDs, certificates (ONLY if {user_id}'s documents)
- Document numbers, policies, licenses (ONLY if belonging to {user_id})
- Credit cards, bank details (ONLY if {user_id}'s financial info)

LAYER 3 - Relationships & Contacts (MEDIUM PRIORITY):
- Family members, friends, colleagues (ONLY if {user_id}'s relationships AND names are mentioned)
- CONTACT DETAILS OF FAMILY/FRIENDS (ONLY if {user_id} is sharing about THEIR contacts)
- IMPORTANT: Only extract relationship if SPECIFIC NAMES are mentioned
- REJECT: Generic "my wife", "my husband" without names
- ACCEPT: "my wife Sarah", "my husband John"

LAYER 4 - Preferences & Instructions (LOWER PRIORITY):
- Food preferences, allergies (ONLY if {user_id}'s preferences)
- Favorite places, vendors (ONLY if {user_id}'s preferences)
- Habits, routines (ONLY if {user_id}'s personal habits)
- DO NOT put travel plans here unless they are long-term preferences
- DO NOT CONSIDER EVERYTHING AS A PREFERENCE, UNTIL {user_id} SAYS OR LIKES IT. 

STRICT LAYER 3 RELATIONSHIP RULES:
- ONLY extract relationships if SPECIFIC NAMES are mentioned.
✅ "My wife Sarah" → Extract: relationship="spouse", name="Sarah"
✅ "My husband John works at..." → Extract: relationship="spouse", name="John"
✅ "My brother Mike lives in..." → Extract: relationship="brother", name="Mike"
❌ "My wife will come" → REJECT (no name mentioned)
❌ "Thanks guys" → REJECT (not a relationship statement)
❌ "I want to carry something for my 9 year old nephew" → REJECT (no name mentioned)


OWNERSHIP VALIDATION EXAMPLES:
✅ "My address is 402, Pinnacle Gold, Bandra" → Extract as {user_id}'s address
❌ "Let's meet at Pinnacle Gold, Bandra" → REJECT (not personal address)
✅ "I live in Mumbai" → Extract as {user_id}'s address  
❌ "Mumbai has good restaurants" → REJECT (general comment, not personal info)
✅ "My wife Sarah" → Extract as {user_id}'s spouse with name "Sarah"
❌ "My wife will come" → REJECT (no specific name mentioned)
❌ "Priya is coming" → REJECT (unclear relationship/ownership)

CRITICAL EXTRACTION RULES:
1. NEVER extract relationship information without specific names.
2. NEVER extract information from casual conversation phrases
3. ALWAYS ensure the information directly belongs to {user_id}
4. FOCUS ON Layer 1, 2, 3 - avoid putting travel plans in Layer 1
5. For relationships: ONLY extract if both relationship type AND name are clear
6. IF THE USER MENTIONS THE CONTACT OR DETAILS OF A FAMILY MEMBER/FRIEND, ONLY EXTRACT IF IT IS CLEAR THAT THE DETAILS BELONG TO {user_id}(For e.g., "My wife's number is..." then save it as spouse phone number)

CONFIDENCE SCORING BASED ON OWNERSHIP:
- 0.9-1.0: Direct personal claims with clear ownership ("My address is...")
- 0.8-0.9: Clear attribution to {user_id} ("I live at...")  
- Below 0.8: REJECT (unclear ownership)

RESPONSE FORMAT (JSON only):
{{
  "Layer1": [
    {{
      "detail": {{"type": "field_type", "value": "extracted_value"}},
      "confidence": 0.95,
      "evidence": [
        {{"message_id": "id", "message_snippet": "relevant_part"}}
      ],
      "timestamp": "2025-09-13 00:00:00",
      "ownership_reason": "Clear personal claim by {user_id}"
    }}
  ],
  "Layer2": [...],
  "Layer3": [...],
  "Layer4": [...]
}}

FIELD VALUE SPECIFICATIONS:
- relationship_status: Use "married" or "single". If mentions "wife"/"husband" use "married"
- gender: Use "Male" or "Female" 
- address: ONLY extract if clearly stated as personal/home address, NOT business/meeting locations or anything other than personal.
- spouse/spouse_name: Use ONLY if specific name is mentioned (e.g., "My wife Sarah" → spouse_name: "Sarah")
- family_member: Use ONLY if specific name is mentioned (e.g., "My brother Mike" → family_member: "Mike")
- phone_number: Use exact format from message,
- email: Use exact email address as written.

PROHIBITED EXTRACTIONS:
❌ Do NOT extract relationships (e.g., "wife", "husband", "nephew") as standalone values without names
❌ Do NOT extract meeting locations as personal addresses
❌ Do NOT extract third-party information as user's information

REMEMBER: When in doubt about ownership or clarity, DO NOT extract. It's better to miss information than to incorrectly attribute someone else's details to {user_id}.

Only return valid JSON. If no clearly owned information found for a layer, return empty array for that layer.
"""
        return prompt

    def call_llm_for_extraction(self, prompt: str) -> Dict:
        """Call Claude LLM for information extraction"""
        try:
            response = self.anthropic_client.messages.create(
                model=self.model_name,
                max_tokens=3000,  # Increased for comprehensive extraction
                temperature=0.1,
                messages=[{"role": "user", "content": prompt}]
            )
            
            # Extract text content from response
            response_text = response.content[0].text
            
            # Try to parse JSON response
            try:
                raw_data = json.loads(response_text)
                # Apply validation to filter out bad extractions
                validated_data = self._validate_extractions(raw_data)
                return validated_data
            except json.JSONDecodeError:
                print(f"Failed to parse LLM response as JSON: {response_text[:200]}...")
                return {}
                
        except Exception as e:
            print(f"LLM API error: {e}")
            return {}

    def _validate_extractions(self, raw_data: Dict) -> Dict:
        """Validate and filter out bad extractions"""
        validated_data = {}
        
        # Invalid values that should never be extracted
        invalid_relationship_values = {
            'wife', 'husband', 'nephew', 'niece', 'son', 'daughter', 'brother', 'sister',
            'mother', 'father', 'aunt', 'uncle', 'cousin', 'friend', 'colleague'
        }
        
        # Invalid evidence snippets that indicate bad extraction
        invalid_evidence_patterns = [
            'thanks guys', 'thank you', 'thanks', 'ok', 'okay', 'yes', 'no',
            'sure', 'great', 'perfect', 'sounds good', 'alright'
        ]
        
        for layer, nodes in raw_data.items():
            validated_nodes = []
            
            for node in nodes:
                if not isinstance(node, dict) or 'detail' not in node:
                    continue
                    
                detail = node['detail']
                fact_type = detail.get('type', '')
                fact_value = detail.get('value', '').lower().strip()
                evidence = node.get('evidence', [])
                
                # Skip invalid extractions
                skip_node = False
                
                # Check for invalid relationship extractions
                if fact_type in ['relationship', 'family_member', 'spouse'] and fact_value in invalid_relationship_values:
                    print(f"⚠️  Skipping invalid {fact_type}: '{fact_value}' (no specific name)")
                    skip_node = True
                
                # Check for invalid evidence snippets
                for ev in evidence:
                    snippet = ev.get('message_snippet', '').lower().strip()
                    if snippet in invalid_evidence_patterns:
                        print(f"⚠️  Skipping extraction from invalid evidence: '{snippet}'")
                        skip_node = True
                        break
                
                # Check for travel plans in Layer 1
                if layer == 'Layer1' and fact_type in ['travel_plan', 'flight_number', 'travel_date']:
                    print(f"⚠️  Moving {fact_type} from Layer1 to Layer4 (travel plans don't belong in basic info)")
                    # Move to Layer4 instead of rejecting
                    if 'Layer4' not in validated_data:
                        validated_data['Layer4'] = []
                    validated_data['Layer4'].append(node)
                    continue
                
                # Check confidence threshold
                confidence = node.get('confidence', 0)
                if confidence < 0.75:
                    print(f"⚠️  Skipping low confidence ({confidence}) extraction: {fact_type} = {fact_value}")
                    skip_node = True
                
                if not skip_node:
                    validated_nodes.append(node)
            
            if validated_nodes:
                validated_data[layer] = validated_nodes
        
        return validated_data

    async def store_in_db(self, extracted_nodes: Dict, user_id: str):
        """Store extracted nodes in Supabase DB using SupabaseManager
        Returns dict with newly_stored_nodes containing only facts that were actually added in this iteration"""
        if not self.db_enabled:
            print(f"\n=== EXTRACTED DATA FOR USER: {user_id} (DB DISABLED) ===")
            for layer, nodes in extracted_nodes.items():
                print(f"\n{layer}:")
                for i, node in enumerate(nodes, 1):
                    print(f"  {i}. Type: {node['detail']['type']}")
                    print(f"     Value: {node['detail']['value']}")
                    print(f"     Confidence: {node['confidence']}")
                    print(f"     Evidence: {len(node['evidence'])} message(s)")
            print("=" * 50)
            # Return all nodes as "newly stored" when DB is disabled (for testing), but filter empty layers
            filtered_extracted = {layer: nodes for layer, nodes in extracted_nodes.items() if nodes}
            return {"newly_stored_nodes": filtered_extracted, "stats": {"stored": 0, "duplicate": 0, "low_confidence_rejected": 0}}
        
        try:
            stored_nodes = 0
            duplicate_nodes = 0
            low_confidence_rejected = 0
            newly_stored_nodes = {}  # Track only nodes that were actually stored in this iteration
            
            # Minimum confidence threshold for ownership validation
            CONFIDENCE_THRESHOLD = 0.75
            
            for layer, nodes in extracted_nodes.items():
                layer_number = int(layer.replace("Layer", ""))
                newly_stored_nodes[layer] = []  # Initialize layer in newly stored nodes
                
                for node in nodes:
                    detail = node["detail"]
                    confidence = node["confidence"]
                    evidence = node["evidence"]
                    
                    # Apply confidence threshold - reject low confidence extractions
                    if confidence < CONFIDENCE_THRESHOLD:
                        low_confidence_rejected += 1
                        print(f"  ⚠️  Rejected low confidence {detail['type']}: {detail['value']} (confidence: {confidence:.2f})")
                        continue
                    
                    # Format concluded fact for human readability
                    concluded_fact = self._format_concluded_fact(user_id, detail["type"], detail["value"])
                    
                    # Store memory node directly in Supabase
                    node_id = await supabase_manager.store_memory_node(
                        user_phone=user_id,
                        layer=layer_number,
                        fact_type=detail["type"],
                        content=detail["value"],
                        concluded_fact=concluded_fact,
                        confidence=confidence,
                        evidence=evidence
                    )
                    
                    if node_id:
                        stored_nodes += 1
                        ownership_reason = node.get('ownership_reason', 'Ownership validated')
                        print(f"  ✅ Stored {detail['type']}: {detail['value']} (confidence: {confidence:.2f}) - {ownership_reason}")
                        # Add to newly stored nodes for this iteration
                        newly_stored_nodes[layer].append(node)
                    else:
                        duplicate_nodes += 1
                        print(f"  ⚠️  Failed to store {detail['type']}: {detail['value']}")
            
            # Print summary
            print(f"\n📊 Database Summary for {user_id}:")
            print(f"   Stored: {stored_nodes} new nodes")
            print(f"   Failed: {duplicate_nodes} nodes")
            print(f"   Rejected (low confidence): {low_confidence_rejected} nodes")
            
            # Get user summary from database
            import asyncio
            summary = await supabase_manager.get_user_summary(user_id)
            if summary:
                print(f"   Total nodes in DB: {summary.get('total_nodes', 0)}")
                print(f"   By status: Approved={summary.get('approved_nodes', 0)}, Pending={summary.get('pending_nodes', 0)}, Rejected={summary.get('rejected_nodes', 0)}")
                if 'layers' in summary:
                    print(f"   By layers: {summary['layers']}")
            
            # Return only the newly stored nodes from this iteration
            # Filter out empty layers for cleaner UI display
            filtered_newly_stored = {layer: nodes for layer, nodes in newly_stored_nodes.items() if nodes}
            
            return {
                "newly_stored_nodes": filtered_newly_stored,
                "stats": {
                    "stored": stored_nodes,
                    "duplicate": duplicate_nodes,
                    "low_confidence_rejected": low_confidence_rejected
                }
            }
            
        except Exception as e:
            print(f"❌ Database error: {e}")
            # Fallback to logging
            print(f"\n=== EXTRACTED DATA FOR USER: {user_id} (DB ERROR FALLBACK) ===")
            for layer, nodes in extracted_nodes.items():
                print(f"\n{layer}:")
                for i, node in enumerate(nodes, 1):
                    print(f"  {i}. Type: {node['detail']['type']}")
                    print(f"     Value: {node['detail']['value']}")
                    print(f"     Confidence: {node['confidence']}")
                    print(f"     Evidence: {len(node['evidence'])} message(s)")
            print("=" * 50)
            # Return all nodes as fallback when DB has errors, but filter empty layers
            filtered_extracted = {layer: nodes for layer, nodes in extracted_nodes.items() if nodes}
            return {"newly_stored_nodes": filtered_extracted, "stats": {"stored": 0, "duplicate": 0, "low_confidence_rejected": 0}}

    def _format_concluded_fact(self, user_id: str, fact_type: str, value: str) -> str:
        """Format a concluded fact in human-readable form"""
        
        # Common fact type mappings with ownership emphasis
        fact_formatters = {
            'phone': lambda u, v: f"📱 Phone number of {u} is {v}",
            'phone_number': lambda u, v: f"📱 Phone number of {u} is {v}",
            'email': lambda u, v: f"📧 Email address of {u} is {v}",
            'address': lambda u, v: f"🏠 Home address of {u} is {v}",
            'dob': lambda u, v: f"🎂 Date of birth of {u} is {v}",
            'name': lambda u, v: f"👤 Name of {u} is {v}",
            'age': lambda u, v: f"📅 Age of {u} is {v}",
            'occupation': lambda u, v: f"💼 Occupation of {u} is {v}",
            'company': lambda u, v: f"🏢 Company of {u} is {v}",
            'relationship_status': lambda u, v: f"💑 Relationship status of {u} is {v}",
            'gender': lambda u, v: f"⚧ Gender of {u} is {v}",
            'nationality': lambda u, v: f"🌍 Nationality of {u} is {v}",
            'document_type': lambda u, v: f"📄 {u} shared a document of type {v}",
            'aadhaar_number': lambda u, v: f"🆔 Aadhaar number of {u} is {v}",
            'pan_number': lambda u, v: f"📇 PAN number of {u} is {v}",
            'family_member': lambda u, v: f"👨‍👩‍👧‍👦 Family member of {u}: {v}",
            'friend': lambda u, v: f"👫 Friend of {u}: {v}",
            'colleague': lambda u, v: f"🤝 Colleague of {u}: {v}",
            'contact_name': lambda u, v: f"📞 Contact of {u}: {v}",
            'relationship_type': lambda u, v: f"💕 {v} of {u}",
            'food_preference': lambda u, v: f"🍽️ Food preference of {u}: {v}",
            'restaurant_preference': lambda u, v: f"🏪 Preferred restaurant of {u}: {v}",
            'allergy': lambda u, v: f"⚠️ {u} is allergic to {v}",
            'service_provider': lambda u, v: f"🔧 Service provider of {u}: {v}",
            'vendor_name': lambda u, v: f"🛒 Vendor used by {u}: {v}",
            'habit': lambda u, v: f"🔄 Personal habit of {u}: {v}",
            'routine': lambda u, v: f"📋 Routine of {u}: {v}",
        }
        
        # Use specific formatter or fallback to generic
        formatter = fact_formatters.get(fact_type, lambda u, v: f"{fact_type.replace('_', ' ').title()} of {u} is {v}")
        return formatter(user_id, value)

    def merge_extracted_data(self, all_extracted: List[Dict]) -> Dict:
        """Merge extracted data from multiple chunks, removing duplicates"""
        merged = {"Layer1": [], "Layer2": [], "Layer3": [], "Layer4": []}
        
        for extracted in all_extracted:
            for layer in ["Layer1", "Layer2", "Layer3", "Layer4"]:
                if layer in extracted:
                    merged[layer].extend(extracted[layer])
        
        # Deduplicate based on fact type and value similarity
        for layer in merged:
            merged[layer] = self._deduplicate_facts(merged[layer])
        
        return merged

    def _deduplicate_facts(self, facts: List[Dict]) -> List[Dict]:
        """Remove duplicate facts based on type and value similarity"""
        if not facts:
            return facts
            
        deduped = []
        for fact in facts:
            is_duplicate = False
            fact_type = fact["detail"]["type"]
            fact_value = fact["detail"]["value"].lower().strip()
            
            for existing in deduped:
                existing_type = existing["detail"]["type"]
                existing_value = existing["detail"]["value"].lower().strip()
                
                # Same type and high similarity
                if (fact_type == existing_type and 
                    fuzz.ratio(fact_value, existing_value) > 85):
                    is_duplicate = True
                    # Keep the one with higher confidence
                    if fact["confidence"] > existing["confidence"]:
                        deduped.remove(existing)
                        deduped.append(fact)
                    break
            
            if not is_duplicate:
                deduped.append(fact)
        
        return deduped
        
    def call_llm_for_deduplication(self, prompt: str) -> Dict:
        """Call LLM specifically for deduplication tasks"""
        try:
            response = self.anthropic_client.messages.create(
                model=self.model_name,
                max_tokens=4000,
                temperature=0.1,  # Low temperature for consistency
                messages=[
                    {"role": "user", "content": prompt}
                ],
                system="""You are a memory system deduplication expert. Your ONLY job is to return a valid JSON with deduplicated facts.
IMPORTANT: 
- REMOVE ANY DUPLICATE VALUES THAT ARE PRESENT, OR ANYTHING THAT LOOKS REPEATED.
- IF THERE ARE 2 SAME KEYS, WITH DIFFERENT VALUES, MAKE SURE YOU ONLY ALLOW ONE INSTANCE WITH THE HIGHEST CONFIDENCE SCORE.
For example, if the same phone number/address is present multiple times, keep only one instance with the highest confidence.
1. Return ONLY the JSON data with NO explanatory text, NO markdown formatting, and NO code blocks
2. Your entire response must be parseable as JSON
3. Maintain the exact same structure as the input JSON
4. CRITICAL: Preserve ALL evidence snippets exactly as given in the input. DO NOT change snippets to "No snippet available" or any placeholder text.
5. Never add new facts or modify existing data beyond merging duplicates
6. If duplicates have different confidence scores, keep the one with higher confidence
7. If duplicates have the same confidence, merge their evidence lists completely with no loss of information"""
            )
            
            # Extract the response content as text
            if not response or not response.content:
                print("⚠️ Empty response from LLM")
                return {}
                
            content = response.content[0].text
            print(f"Raw LLM response (first 100 chars): {content[:100]}...")
            
            # Try multiple methods to extract JSON
            
            # Method 1: Try to find JSON in code blocks
            json_match = re.search(r'```(?:json)?\s*([\s\S]*?)\s*```', content)
            if json_match:
                json_str = json_match.group(1)
                print("Found JSON in code block")
            else:
                # Method 2: Find first { and last }
                first_brace = content.find('{')
                last_brace = content.rfind('}')
                
                if first_brace != -1 and last_brace != -1 and first_brace < last_brace:
                    json_str = content[first_brace:last_brace+1]
                    print(f"Extracted JSON using brace matching: chars {first_brace} to {last_brace}")
                else:
                    # Method 3: Use the whole response
                    json_str = content
                    print("Using full response content for JSON parsing")
            
            # Clean up the JSON string
            json_str = re.sub(r'(?m)^//.*$', '', json_str)  # Remove comment lines
            json_str = json_str.strip()
            
            try:
                print(f"Attempting to parse JSON (length: {len(json_str)})")
                result = json.loads(json_str)
                print("✅ Successfully parsed JSON")
                return result
            except json.JSONDecodeError as e:
                print(f"⚠️ Failed to decode JSON from LLM response: {e}")
                print(f"JSON string start: {json_str[:200]}...")
                print(f"JSON string end: ...{json_str[-200:]}")
                
                # Fallback to raw extraction
                try:
                    # Attempt to rescue the response using regex
                    layer_pattern = r'"(Layer\d+)":\s*\[([\s\S]*?)\]'
                    layers = re.findall(layer_pattern, json_str)
                    
                    if layers:
                        print("🛠️ Attempting fallback regex extraction")
                        result = {}
                        for layer_name, layer_content in layers:
                            result[layer_name] = []
                        return result
                except Exception as regex_error:
                    print(f"Regex fallback failed: {regex_error}")
                    
                return {}
                
        except Exception as e:
            print(f"⚠️ Error calling LLM for deduplication: {e}")
            return {}

    async def deduplicate_with_llm(self, extracted_data: Dict, user_id: str) -> Dict:
        """Use LLM to deduplicate facts and merge evidence when appropriate
        
        This takes the raw extraction results and has the LLM analyze them to:
        1. Remove exact duplicates, keeping the highest confidence version
        2. Merge duplicates with same confidence by combining their evidence
        3. Maintain the 4-layer memory structure
        """
        if not extracted_data:
            print(f"No data to deduplicate for user {user_id}")
            return {}
            
        # Convert extracted data to a format suitable for LLM processing
        facts_by_layer = {}
        for layer, nodes in extracted_data.items():
            facts_by_layer[layer] = []
            for node in nodes:
                # Create a simplified representation for LLM
                evidence_snippets = []
                for ev in node['evidence']:
                    evidence_snippets.append({
                        'message_id': ev.get('message_id', 'unknown'),
                        'snippet': ev.get('message_snippet', ev.get('snippet', ''))  # Handle both formats
                    })
                    
                fact = {
                    'type': node['detail']['type'],
                    'value': node['detail']['value'],
                    'confidence': node['confidence'],
                    'evidence': evidence_snippets
                }
                facts_by_layer[layer].append(fact)
        
        # Create prompt for LLM deduplication
        prompt = f"""
Review and deduplicate the following memory facts for user {user_id}.

INSTRUCTIONS:
1. PHONE NUMBER DEDUPLICATION: If there are multiple phone numbers for the same person, keep ONLY the one with the highest confidence score. Different formats of the same number (+91 prefix vs without) should be considered duplicates.
2. ADDRESS DEDUPLICATION: If there are multiple addresses for the same person, keep ONLY the one with the highest confidence score. Similar addresses should be considered duplicates.
3. EMAIL DEDUPLICATION: If there are multiple emails, keep all distinct email addresses as people often have multiple emails.
4. RELATIONSHIP DEDUPLICATION: Remove any relationship entries that are just generic terms like "wife", "husband", "nephew" without specific names. Only keep relationships with actual names.
5. GENERAL RULE: For all other fact types, remove duplicates keeping only the highest confidence version for each unique fact.
6. If duplicates have identical confidence scores, merge their evidence lists into one comprehensive fact.
7. Maintain the 4-layer structure (Layer1: Basic Personal Info, Layer2: Documents, Layer3: Relationships, Layer4: Preferences).
8. Do not add, remove, or modify any actual data values - simply reorganize and deduplicate.
9. CRITICAL: Preserve ALL evidence snippets exactly as given in the input. DO NOT replace snippets with "No snippet available" or any placeholder text.
10. Return ONLY a valid JSON with no additional text or explanation.

IMPORTANT: Your response must be ONLY the deduplicated JSON data with nothing else. Do not include any explanations, markdown formatting, or text outside the JSON. Return the JSON directly with all evidence snippets preserved exactly as provided.

When processing evidence, maintain the exact field names as provided in input (message_id and either 'snippet' or 'message_snippet').

RELATIONSHIP FILTERING RULES:
- REMOVE: "relationship": "wife" (no name specified)
- REMOVE: "family_member": "nephew" (no name specified)  
- KEEP: "spouse": "Sarah" (specific name provided)
- KEEP: "family_member": "Mike Johnson" (specific name provided)

PHONE NUMBER DEDUPLICATION EXAMPLE:
These are 3 different phone numbers for the same person. Keep ONLY the highest confidence one: "9870781578" (confidence: 0.95)

Input facts: {json.dumps(facts_by_layer, indent=2)}
"""

        try:
            # Call LLM for deduplication
            deduplicated_data = self.call_llm_for_deduplication(prompt)
            
            # Verify we got a valid response
            if not deduplicated_data:
                print("⚠️ No valid data from LLM deduplication. Applying fallback deduplication.")
                return self._apply_fallback_deduplication(extracted_data, user_id)
                
            # Verify that we have all the expected layers
            missing_layers = set(extracted_data.keys()) - set(deduplicated_data.keys())
            if missing_layers:
                print(f"⚠️ LLM response is missing layers: {missing_layers}. Applying fallback deduplication.")
                return self._apply_fallback_deduplication(extracted_data, user_id)
            
            print(f"\n🔍 LLM deduplication complete for {user_id}")
            
            # Count before/after
            before_count = sum(len(nodes) for nodes in extracted_data.values())
            after_count = sum(len(nodes) for nodes in deduplicated_data.values())
            
            # Safety check - if LLM removed all facts, something went wrong
            if after_count == 0 and before_count > 0:
                print("⚠️ LLM deduplication removed ALL facts! Applying fallback deduplication.")
                return self._apply_fallback_deduplication(extracted_data, user_id)
                
            print(f"   Facts before: {before_count}, after: {after_count}, removed: {before_count - after_count}")
            
            # Convert back to the original format structure
            result = {}
            for layer, facts in deduplicated_data.items():
                result[layer] = []
                for fact in facts:
                    # Handle potential missing keys with defaults
                    if 'type' not in fact or 'value' not in fact:
                        print(f"⚠️ Skipping malformed fact (missing type/value): {fact}")
                        continue
                        
                    # Reconstruct evidence in the expected format - strictly preserve original snippets
                    evidence = []
                    if 'evidence' in fact and isinstance(fact['evidence'], list):
                        for ev in fact['evidence']:
                            message_id = ev.get('message_id', 'unknown')
                            # Handle both 'snippet' and 'message_snippet' from LLM responses
                            snippet = ev.get('snippet', ev.get('message_snippet', ''))
                            
                            # Ensure snippet is preserved exactly as in the original
                            if not snippet or snippet == "No snippet available":
                                print(f"⚠️ Warning: Missing or placeholder snippet for message {message_id}")
                                
                            evidence.append({
                                'message_id': message_id,
                                'snippet': snippet
                            })
                    else:
                        print(f"⚠️ Warning: Missing evidence list in fact: {fact['type']}: {fact['value']}")
                        # Create minimal evidence to avoid UI errors
                        evidence = [{'message_id': 'unknown', 'snippet': 'Evidence missing during deduplication'}]
                    
                    # Reconstruct node in the expected format
                    node = {
                        'detail': {
                            'type': fact['type'],
                            'value': fact['value']
                        },
                        'confidence': fact.get('confidence', 0.8),  # Default if missing
                        'evidence': evidence
                    }
                    result[layer].append(node)
            
            return result
        except Exception as e:
            print(f"⚠️ Error during LLM deduplication: {e}")
            print("Applying fallback deduplication to ensure duplicates are removed")
            return self._apply_fallback_deduplication(extracted_data, user_id)

    def _apply_fallback_deduplication(self, extracted_data: Dict, user_id: str) -> Dict:
        """Apply rule-based deduplication when LLM deduplication fails
        
        This ensures that deduplication ALWAYS happens, even if LLM fails.
        """
        print(f"\n🔧 Applying fallback deduplication for {user_id}")
        
        result = {}
        total_removed = 0
        
        for layer, nodes in extracted_data.items():
            if not nodes:
                result[layer] = []
                continue
                
            # Apply rule-based deduplication with special handling for phone numbers
            deduplicated_nodes = self._deduplicate_facts_enhanced(nodes, layer)
            result[layer] = deduplicated_nodes
            
            removed_count = len(nodes) - len(deduplicated_nodes)
            total_removed += removed_count
            
            if removed_count > 0:
                print(f"   {layer}: {len(nodes)} → {len(deduplicated_nodes)} facts (removed {removed_count} duplicates)")
        
        before_count = sum(len(nodes) for nodes in extracted_data.values())
        after_count = sum(len(nodes) for nodes in result.values())
        
        print(f"   Facts before: {before_count}, after: {after_count}, removed: {total_removed}")
        print(f"✅ Fallback deduplication complete for {user_id}")
        
        return result
    
    def _deduplicate_facts_enhanced(self, facts: List[Dict], layer: str) -> List[Dict]:
        """Enhanced rule-based deduplication with special handling for different fact types"""
        if not facts:
            return []
        
        deduped = []
        
        # Group facts by type for specialized deduplication
        facts_by_type = {}
        for fact in facts:
            fact_type = fact['detail']['type']
            if fact_type not in facts_by_type:
                facts_by_type[fact_type] = []
            facts_by_type[fact_type].append(fact)
        
        # Apply type-specific deduplication rules
        for fact_type, type_facts in facts_by_type.items():
            if fact_type == 'phone_number':
                # For phone numbers: keep only the highest confidence one
                deduplicated = self._deduplicate_phone_numbers(type_facts)
            elif fact_type in ['address', 'email']:
                # For addresses and emails: more sophisticated deduplication
                deduplicated = self._deduplicate_contact_info(type_facts, fact_type)
            else:
                # For other types: use standard fuzzy matching
                deduplicated = self._deduplicate_facts(type_facts)
            
            deduped.extend(deduplicated)
        
        return deduped
    
    def _deduplicate_phone_numbers(self, phone_facts: List[Dict]) -> List[Dict]:
        """Keep only the highest confidence phone number"""
        if not phone_facts:
            return []
        
        # Sort by confidence (highest first)
        sorted_phones = sorted(phone_facts, key=lambda x: x['confidence'], reverse=True)
        
        # Keep only the highest confidence phone number
        best_phone = sorted_phones[0]
        
        print(f"      Phone deduplication: {len(phone_facts)} → 1 (kept highest confidence: {best_phone['detail']['value']})")
        
        return [best_phone]
    
    def _deduplicate_contact_info(self, contact_facts: List[Dict], fact_type: str) -> List[Dict]:
        """Deduplicate addresses/emails with fuzzy matching"""
        if not contact_facts:
            return []
        
        deduped = []
        
        for fact in contact_facts:
            fact_value = fact['detail']['value'].lower().strip()
            is_duplicate = False
            
            for existing in deduped:
                existing_value = existing['detail']['value'].lower().strip()
                
                # For emails: exact match after normalization
                if fact_type == 'email':
                    if fact_value == existing_value:
                        is_duplicate = True
                        break
                
                # For addresses: fuzzy matching
                elif fact_type == 'address':
                    if (fact_value == existing_value or 
                        fuzz.ratio(fact_value, existing_value) > 85):
                        is_duplicate = True
                        # Keep the one with higher confidence
                        if fact["confidence"] > existing["confidence"]:
                            deduped.remove(existing)
                            deduped.append(fact)
                        break
            
            if not is_duplicate:
                deduped.append(fact)
        
        if len(contact_facts) != len(deduped):
            print(f"      {fact_type} deduplication: {len(contact_facts)} → {len(deduped)}")
        
        return deduped

    async def process_json(self, input_json: List[Dict], user_id: str, force_reprocess: bool = False) -> Dict:
        """Process the JSON: chunk messages, call LLM for each chunk, merge and store results"""
        
        # Check if file has already been processed (unless force reprocess)
        if not force_reprocess and self.db_enabled:
            already_processed = await supabase_manager.is_file_processed(user_id)
            if already_processed:
                print(f"⏭️  {user_id} already processed. Skipping. Use force_reprocess=True to reprocess.")
                return {"message": "Already processed", "skipped": True}
        
        # Flatten messages, preserving order and adding metadata
        all_messages = []
        for conv_idx, conv in enumerate(input_json):
            for query in conv.get("user_queries", []):
                query = query.copy()
                query["sender"] = "User"
                query["conversation_id"] = conv_idx
                # Preserve original message_id, use as id for processing
                query["id"] = query.get("message_id", f"unknown_user_{conv_idx}")
                all_messages.append(query)
            for reply in conv.get("team_replies", []):
                reply = reply.copy()
                reply["sender"] = "Team"
                reply["conversation_id"] = conv_idx
                # Preserve original message_id, use as id for processing
                reply["id"] = reply.get("message_id", f"unknown_team_{conv_idx}")
                all_messages.append(reply)

        print(f"Processing {len(all_messages)} messages for user {user_id}")
        
        # Create chunks for processing
        chunks = self.chunk_messages(all_messages)
        print(f"Split into {len(chunks)} chunks (chunk_size={self.chunk_size}, overlap={self.overlap_size})")
        
        # Process each chunk
        all_extracted_data = []
        for i, chunk in enumerate(chunks):
            print(f"\nProcessing chunk {i+1}/{len(chunks)} ({len(chunk)} messages)")
            
            prompt = self.prepare_comprehensive_llm_prompt(chunk, user_id)
            extracted_data = self.call_llm_for_extraction(prompt)
            
            if extracted_data:
                # Count nodes in this chunk
                total_nodes = sum(len(nodes) for nodes in extracted_data.values() if isinstance(nodes, list))
                print(f"  Extracted {total_nodes} nodes from chunk {i+1}")
                all_extracted_data.append(extracted_data)
            else:
                print(f"  No data extracted from chunk {i+1}")
        
        # Merge all extracted data and remove duplicates
        if all_extracted_data:
            merged_data = self.merge_extracted_data(all_extracted_data)
            
            # Print summary
            total_nodes = sum(len(nodes) for nodes in merged_data.values())
            print(f"\nMerged Results for user {user_id}: {total_nodes} total nodes")
            for layer, nodes in merged_data.items():
                if nodes:
                    print(f"  {layer}: {len(nodes)} nodes")
            
            # NEW STEP: Apply LLM deduplication to get a refined version with no duplicates
            print("\n🧹 Applying LLM deduplication to remove duplicates and merge evidence...")
            deduplicated_data = await self.deduplicate_with_llm(merged_data, user_id)
            
            # Print deduplication summary
            dedup_total_nodes = sum(len(nodes) for nodes in deduplicated_data.values())
            print(f"\nDeduplicated Results for user {user_id}: {dedup_total_nodes} total nodes")
            for layer, nodes in deduplicated_data.items():
                if nodes:
                    print(f"  {layer}: {len(nodes)} nodes")
            
            # Store deduplicated data in database
            storage_result = await self.store_in_db(deduplicated_data, user_id)
            
            # Mark file as processed
            if self.db_enabled:
                await supabase_manager.mark_file_processed(user_id, dedup_total_nodes)
            
            # Return only the newly stored facts from this iteration
            newly_stored_facts = storage_result.get("newly_stored_nodes", {})
            print(f"\n🎯 Returning {sum(len(nodes) for nodes in newly_stored_facts.values())} newly stored facts for this iteration")
            
            return newly_stored_facts
        else:
            print(f"No data extracted for user {user_id}")
            return {}

    async def reprocess_rejected_fact(self, user_id: str, fact_type: str, layer: str, 
                               excluded_message_ids: List[str], original_node_id: str) -> Dict:
        """Reprocess a specific rejected fact type by re-analyzing with focused prompt"""
        
        # Load the user's JSON file
        input_path = os.path.join("input_jsons", f"{user_id}.json")
        if not os.path.exists(input_path):
            print(f"Warning: {input_path} not found for reprocessing.")
            return {}
        
        with open(input_path, 'r', encoding='utf-8') as f:
            input_data = json.load(f)
        
        # Flatten messages, preserving order
        all_messages = []
        for conv in input_data:
            for query in conv.get("user_queries", []):
                query = query.copy()
                query["sender"] = "User"
                # Preserve original message_id, use as id for processing
                query["id"] = query.get("message_id", "unknown_user")
                all_messages.append(query)
            for reply in conv.get("team_replies", []):
                reply = reply.copy()
                reply["sender"] = "Team"
                # Preserve original message_id, use as id for processing
                reply["id"] = reply.get("message_id", "unknown_team")
                all_messages.append(reply)
        
        # Filter out messages that were used in the original (rejected) extraction
        filtered_messages = [
            msg for msg in all_messages 
            if msg.get("id") not in excluded_message_ids
        ]
        
        print(f"Reprocessing {fact_type} for {user_id}")
        print(f"Original context had {len(excluded_message_ids)} messages, searching in {len(filtered_messages)} remaining messages")
        
        # Create chunks from filtered messages
        chunks = self.chunk_messages(filtered_messages)
        
        layer_number = layer.split("_")[-1] if "_" in layer else layer.replace("layer", "").replace("Layer", "")
        layer_key = f"Layer{layer_number}"
        extracted_data = {layer_key: []}
        
        print(f"Processing {len(chunks)} chunks for reprocessing")
        
        for i, chunk in enumerate(chunks):
            print(f"  Reprocessing chunk {i+1}: {len(chunk)} messages")
            
            # Create a specialized prompt for reprocessing
            prompt = self.prepare_reprocessing_prompt(chunk, layer_key, fact_type)
            llm_output = self.call_llm_for_extraction(prompt)
            nodes = llm_output.get(layer_key, [])
            
            if nodes:
                print(f"    Extracted {len(nodes)} nodes on reprocessing")
                extracted_data[layer_key].extend(nodes)
            else:
                print(f"    No nodes extracted on reprocessing")
        
        # Deduplicate the reprocessed results
        if extracted_data[layer_key]:
            extracted_data[layer_key] = self._deduplicate_facts(extracted_data[layer_key])
            await self.store_reprocessed_nodes(extracted_data, user_id, original_node_id)
        else:
            print(f"Reprocessing complete: No {fact_type} found in alternative contexts")
        
        return extracted_data

    def prepare_reprocessing_prompt(self, chunk: List[Dict[str, str]], layer: str, fact_type: str) -> str:
        """Prepare specialized prompt for reprocessing rejected facts"""
        deduped_chunk = self.deduplicate_messages(chunk)
        context_text = "\n".join([
            f"[{msg.get('id', i)}] {msg.get('sender', 'Unknown')}: {msg.get('message', '')}" 
            for i, msg in enumerate(deduped_chunk)
        ])
        layer_number = layer.replace("Layer", "")
        
        layer_descriptions = {
            "1": "Basic Personal Information (name, age, address, phone, email, DOB, nationality, gender, blood group, relationship status)",
            "2": "Information from Documents Shared (Aadhaar card, PAN card, driving license, voter ID, birth certificate, insurance, rent agreement, utility bills)",
            "3": "Loved Ones & Relations (family members, friends, colleagues, roommates, partners with their names, relationships, and contact details)",
            "4": "Preferences, Vendors, Standing Instructions (food preferences, favorite restaurants, service providers, vendors, habits, routines, standing orders)"
        }
        
        prompt = f"""
You are reprocessing a REJECTED extraction for a personal assistant memory system. A previous extraction of "{fact_type}" was rejected by reviewers.

LAYER {layer_number}: {layer_descriptions[layer_number]}

SPECIFIC TASK: Find "{fact_type}" information in this conversation chunk with extra care and precision.

CONVERSATION CHUNK:
{context_text}

INSTRUCTIONS:
1. Focus ONLY on finding clear, unambiguous "{fact_type}" information
2. This is a REPROCESSING attempt - be more careful and precise than usual
3. Look for casual conversational patterns, not just formal statements
4. Only extract if you find very clear evidence with high confidence (0.8+)
5. If not found clearly, return empty results
6. Reference specific message IDs as evidence

RESPONSE FORMAT (JSON only):
{{
  "{layer}": [
    {{
      "detail": {{"type": "{fact_type}", "value": "extracted_value"}},
      "confidence": 0.85,
      "evidence": [
        {{"message_id": "id", "message_snippet": "relevant_part_of_message"}}
      ],
      "timestamp": "2025-09-13 00:00:00"
    }}
  ]
}}

Only return JSON. If no clear "{fact_type}" information is found, return empty array.
"""
        return prompt

    async def store_reprocessed_nodes(self, extracted_nodes: Dict, user_id: str, original_node_id: str):
        """Store reprocessed nodes with link to original rejected node"""
        if not self.db_enabled:
            print(f"\n=== REPROCESSED DATA FOR USER: {user_id} (DB DISABLED) ===")
            for layer, nodes in extracted_nodes.items():
                print(f"\n{layer}:")
                for i, node in enumerate(nodes, 1):
                    print(f"  {i}. Type: {node['detail']['type']}")
                    print(f"     Value: {node['detail']['value']}")
                    print(f"     Confidence: {node['confidence']}")
                    print(f"     Evidence: {len(node['evidence'])} message(s)")
                    print(f"     Original Node ID: {original_node_id}")
            print("=" * 50)
            return
        
        try:
            stored_nodes = 0
            
            for layer, nodes in extracted_nodes.items():
                layer_number = int(layer.replace("Layer", ""))
                
                for node in nodes:
                    detail = node["detail"]
                    confidence = node["confidence"]
                    evidence = node["evidence"]
                    
                    # Format concluded fact for human readability
                    concluded_fact = self._format_concluded_fact(user_id, detail["type"], detail["value"])
                    
                    # Store reprocessed memory node with link to original
                    node_id = await supabase_manager.store_memory_node(
                        user_phone=user_id,
                        layer=layer_number,
                        fact_type=detail["type"],
                        content=detail["value"],
                        concluded_fact=concluded_fact,
                        confidence=confidence,
                        evidence=evidence,
                        extraction_method='reprocess',
                        parent_update_id=original_node_id
                    )
                    
                    if node_id:
                        stored_nodes += 1
                        print(f"  ✅ Stored reprocessed {detail['type']}: {detail['value']} (Node ID: {node_id})")
                    else:
                        print(f"  ⚠️  Failed to store reprocessed {detail['type']}: {detail['value']}")
            
            # Mark original node as reprocessed
            if stored_nodes > 0:
                await supabase_manager.mark_reprocessing_complete(original_node_id)
                print(f"\n📊 Reprocessing Summary for {user_id}:")
                print(f"   Stored: {stored_nodes} reprocessed nodes")
                print(f"   Linked to original node: {original_node_id}")
            
        except Exception as e:
            print(f"❌ Database error during reprocessing: {e}")

    def main(self):
        """Standalone batch processing for all JSON files"""
        input_folder = "input_jsons"
        input_files = [
            "RahulSingh.json",
            "MonarkMoolchandani.json",
            "ManuJain.json",
            "Gaurav-Sherlocksai.json",
            "Anurag.json",
            "AdityaShetty.json"
        ]

        for filename in input_files:
            input_path = os.path.join(input_folder, filename)
            if not os.path.exists(input_path):
                print(f"Warning: {input_path} not found, skipping.")
                continue

            print(f"\n{'='*50}")
            print(f"Processing {input_path}")
            print(f"{'='*50}")
            
            with open(input_path, 'r', encoding='utf-8') as f:
                input_data = json.load(f)

            user_id = filename.split(".")[0]
            
            import asyncio
            asyncio.run(self.process_json(input_data, user_id))
            print(f"Finished processing {input_path}")

if __name__ == "__main__":
    extractor = JSONContextExtractor(chunk_size=100, overlap_size=20)  # Configurable chunk sizes
    extractor.main()