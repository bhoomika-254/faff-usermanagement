#!/usr/bin/env python3
"""
JSON Context Extractor CLI Tool
Usage: python process_json.py
"""

import json
import os
import asyncio
from src.preprocessor.json_context_extractor import JSONContextExtractor

async def main():
    input_folder = "input_jsons"
    input_files = [
        "RahulSingh.json",
        "MonarkMoolchandani.json",
        "ManuJain.json",
        "Gaurav-Sherlocksai.json",
        "Anurag.json",
        "AdityaShetty.json"
    ]

    extractor = JSONContextExtractor()

    for filename in input_files:
        input_path = os.path.join(input_folder, filename)
        if not os.path.exists(input_path):
            print(f"Warning: {input_path} not found, skipping.")
            continue

        print(f"Processing {input_path}")
        with open(input_path, 'r', encoding='utf-8') as f:
            input_data = json.load(f)

        # Extract user_id from filename
        user_id = filename.split(".")[0]

        # Process the JSON and store in DB
        await extractor.process_json(input_data, user_id)
        print(f"Finished processing {input_path}")

    print("All files processed.")

if __name__ == "__main__":
    asyncio.run(main())