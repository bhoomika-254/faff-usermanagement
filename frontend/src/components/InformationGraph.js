import React, { useState, useEffect, useCallback } from 'react';
import { Card, Row, Col, Spinner, Alert, Badge } from 'react-bootstrap';
import { FaUser, FaHeart, FaIdCard, FaStar } from 'react-icons/fa';
import { memoryAPI } from '../services/api';

const InformationGraph = () => {
  const [userSummaries, setUserSummaries] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [isInitialized, setIsInitialized] = useState(false);

  useEffect(() => {
    // Prevent duplicate calls in React StrictMode during development
    if (!isInitialized) {
      setIsInitialized(true);
      fetchAcceptedInformation();
    }
  }, [isInitialized]);

  const fetchAcceptedInformation = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      
      // Get all users first
      if (process.env.NODE_ENV === 'development') {
        console.log('Fetching users...');
      }
      const usersResponse = await memoryAPI.getUsers();
      const users = usersResponse.data; // This is already an array of user IDs
      if (process.env.NODE_ENV === 'development') {
        console.log('Users fetched:', users);
      }
      
      if (!users || users.length === 0) {
        setError('No users found in the system');
        return;
      }
      
      const summaries = [];
      
      // For each user, get their accepted information
      for (const userId of users) {
        try {
          if (process.env.NODE_ENV === 'development') {
            console.log(`Fetching memory for user: ${userId}`);
          }
          const memoryResponse = await memoryAPI.getUserMemory(userId);
          const concludedFacts = memoryResponse.data || []; // API returns array directly
          
          // Filter only approved facts
          const approvedFacts = concludedFacts.filter(fact => fact.status === 'approved');
          
          console.log(`User ${userId} - Total facts: ${concludedFacts.length}, Approved facts: ${approvedFacts.length}`);
          console.log(`User ${userId} - Layer 4+ approved facts:`, approvedFacts.filter(f => f.layer === 'Layer4'));
          
          if (approvedFacts.length > 0) {
            const summary = processUserFacts(userId, approvedFacts);
            console.log(`User ${userId} - Final summary preferences:`, summary.preferences);
            console.log(`User ${userId} - Final summary interests:`, summary.interests);
            summaries.push(summary);
          }
        } catch (err) {
          console.error(`Error fetching memory for user ${userId}:`, err);
          // Continue with other users even if one fails
        }
      }
      
      if (process.env.NODE_ENV === 'development') {
        console.log('Final summaries:', summaries);
      }
      setUserSummaries(summaries);
      
      if (summaries.length === 0) {
        setError('No approved information found for any users');
      }
      
    } catch (err) {
      setError(`Failed to load user information: ${err.message}`);
      console.error('Error fetching user information:', err);
    } finally {
      setLoading(false);
    }
  }, []);

  const processUserFacts = (userId, facts) => {
    console.log(`Processing ${facts.length} facts for ${userId}:`, facts);
    
    // Create a dynamic structure to hold all fact types
    const factsByType = {};
    const mobileNumbers = [];
    const emails = [];
    
    facts.forEach(fact => {
      const factType = fact.fact_type || 'unknown';
      const conclusion = fact.conclusion || '';
      const rawValue = fact.raw_value || '';
      
      // Extract value after "is" from conclusion or use raw_value
      let value = '';
      if (rawValue && rawValue !== 'N/A') {
        value = rawValue.trim();
      } else {
        // Extract from conclusion - find text after "is"
        const match = conclusion.match(/.*\s+is\s+(.+)/i);
        if (match) {
          value = match[1].trim();
        } else {
          // Fallback - use the whole conclusion if no "is" pattern
          value = conclusion.trim();
        }
      }
      
      // Skip empty or meaningless values
      if (!value || value === 'N/A' || value.length <= 1) {
        return;
      }
      
      // Group by fact type for dynamic display
      if (!factsByType[factType]) {
        factsByType[factType] = [];
      }
      
      // Avoid duplicates
      if (!factsByType[factType].includes(value)) {
        factsByType[factType].push(value);
      }
      
      // Special handling for UI compatibility - populate existing structure
      if (factType === 'phone_number' || factType === 'phone' || factType === 'mobile') {
        if (!mobileNumbers.includes(value)) {
          mobileNumbers.push(value);
        }
      }
      
      if (factType === 'email') {
        if (!emails.includes(value)) {
          emails.push(value);
        }
      }
    });
    
    // Build the summary structure that matches existing UI expectations
    const summary = {
      userId,
      basicInfo: {
        userName: factsByType['name']?.[0] || '',
        fullName: factsByType['full_name']?.[0] || '',
        homeAddress: factsByType['address']?.[0] || factsByType['home_address']?.[0] || '',
        officeAddress: factsByType['office_address']?.[0] || '',
        dob: factsByType['date_of_birth']?.[0] || factsByType['dob']?.[0] || '',
        gender: factsByType['gender']?.[0] || '',
        bloodGroup: factsByType['blood_group']?.[0] || '',
        mobileNumbers: mobileNumbers,
        relationshipStatus: factsByType['relationship_status']?.[0] || factsByType['marital_status']?.[0] || '',
        nationality: factsByType['nationality']?.[0] || '',
        placeOfBirth: factsByType['place_of_birth']?.[0] || '',
        email: emails[0] || '',
        additionalEmails: emails.slice(1)
      },
      spouse: {
        fullName: factsByType['spouse_name']?.[0] || factsByType['spouse']?.[0] || factsByType['wife']?.[0] || factsByType['husband']?.[0] || '',
        homeAddress: '',
        officeAddress: '',
        dob: '',
        gender: '',
        bloodGroup: '',
        mobileNumbers: [],
        relationshipStatus: '',
        nationality: '',
        placeOfBirth: ''
      },
      documents: {
        aadhaarCard: factsByType['aadhaar']?.[0] || '',
        panCard: factsByType['pan']?.[0] || '',
        drivingLicense: factsByType['driving_license']?.[0] || '',
        voterID: factsByType['voter_id']?.[0] || '',
        passport: factsByType['passport']?.[0] || '',
        birthCertificate: '',
        healthInsurance: '',
        marriageCertificate: '',
        rentAgreement: '',
        utilityBill: ''
      },
      relations: {
        mother: { fullName: factsByType['mother']?.[0] || '' },
        father: { fullName: factsByType['father']?.[0] || '' },
        sibling: { fullName: factsByType['sibling']?.[0] || '' },
        flatmate: { fullName: factsByType['flatmate']?.[0] || '' },
        partner: { fullName: factsByType['partner']?.[0] || '' },
        friend: { fullName: factsByType['friend']?.[0] || '' },
        boss: { fullName: factsByType['boss']?.[0] || '' },
        maid: { fullName: factsByType['maid']?.[0] || '' },
        cook: { fullName: factsByType['cook']?.[0] || '' },
        driver: { fullName: factsByType['driver']?.[0] || '' }
      },
      // Dynamic preferences - include ALL fact types that aren't in basic categories
      preferences: [],
      interests: [],
      // Dynamic fact display - show ALL fact types
      allFacts: factsByType,
      financial: factsByType['credit_card_last_digits'] ? {
        creditCardLastDigits: factsByType['credit_card_last_digits'][0]
      } : null,
      stats: {
        totalFacts: facts.length,
        layerDistribution: { Layer1: 0, Layer2: 0, Layer3: 0, Layer4: 0 }
      }
    };

    // Categorize fact types dynamically
    const basicInfoTypes = ['name', 'full_name', 'address', 'home_address', 'office_address', 'date_of_birth', 'dob', 'gender', 'blood_group', 'phone_number', 'phone', 'mobile', 'email', 'relationship_status', 'marital_status', 'nationality', 'place_of_birth'];
    const documentTypes = ['aadhaar', 'pan', 'driving_license', 'voter_id', 'passport'];
    const relationTypes = ['spouse_name', 'spouse', 'wife', 'husband', 'mother', 'father', 'sibling', 'flatmate', 'partner', 'friend', 'boss', 'maid', 'cook', 'driver'];
    const financialTypes = ['credit_card_last_digits'];
    
    // Only add fact types that contain "preference" or "interest" to the dedicated sections
    Object.keys(factsByType).forEach(factType => {
      if (factType.includes('preference') && !basicInfoTypes.includes(factType) && 
          !documentTypes.includes(factType) && !relationTypes.includes(factType) && 
          !financialTypes.includes(factType)) {
        
        factsByType[factType].forEach(value => {
          if (!summary.preferences.includes(value)) {
            summary.preferences.push(value);
          }
        });
      } else if (factType.includes('interest') || factType.includes('hobby')) {
        factsByType[factType].forEach(value => {
          if (!summary.interests.includes(value)) {
            summary.interests.push(value);
          }
        });
      }
    });

    // Count layer distribution for existing UI
    facts.forEach(fact => {
      const layer = fact.layer;
      if (summary.stats.layerDistribution[layer] !== undefined) {
        summary.stats.layerDistribution[layer]++;
      }
    });

    // Debug output to see what we extracted
    console.log(`Processing user facts - Extracted preferences:`, summary.preferences);
    console.log(`Processing user facts - Extracted interests:`, summary.interests);
    console.log(`Processing user facts - All fact types:`, Object.keys(factsByType));

    return summary;
  };
  const renderBasicInformation = (basicInfo) => {
    const fields = [
      { label: 'User Name', value: basicInfo.userName },
      { label: 'Full Name', value: basicInfo.fullName },
      { label: 'Home Address', value: basicInfo.homeAddress },
      { label: 'Office Address', value: basicInfo.officeAddress },
      { label: 'Email', value: basicInfo.email },
      { label: 'Additional Emails', value: basicInfo.additionalEmails?.join(', ') },
      { label: 'Date of Birth', value: basicInfo.dob },
      { label: 'Gender', value: basicInfo.gender },
      { label: 'Blood Group', value: basicInfo.bloodGroup },
      { label: 'Mobile Numbers', value: basicInfo.mobileNumbers.join(', ') },
      { label: 'Relationship Status', value: basicInfo.relationshipStatus },
      { label: 'Nationality', value: basicInfo.nationality },
      { label: 'Place of Birth', value: basicInfo.placeOfBirth }
    ];

    // Filter out empty values and "N/A" values
    const visibleFields = fields.filter(field => field.value && field.value !== 'N/A');

    if (visibleFields.length === 0) return null;

    return (
      <div className="info-category">
        <div className="info-category-title">
          <FaUser className="me-2" />
          Basic Information
        </div>
        {visibleFields.map((field, index) => (
          <div key={index} className="info-item">
            <strong>{field.label}:</strong> {field.value}
          </div>
        ))}
      </div>
    );
  };

  const renderSpouseInformation = (spouse) => {
    const fields = [
      { label: 'Full Name', value: spouse.fullName },
      { label: 'Home Address', value: spouse.homeAddress },
      { label: 'Office Address', value: spouse.officeAddress },
      { label: 'Date of Birth', value: spouse.dob },
      { label: 'Gender', value: spouse.gender },
      { label: 'Blood Group', value: spouse.bloodGroup },
      { label: 'Mobile Numbers', value: spouse.mobileNumbers?.join(', ') },
      { label: 'Relationship Status', value: spouse.relationshipStatus },
      { label: 'Nationality', value: spouse.nationality },
      { label: 'Place of Birth', value: spouse.placeOfBirth }
    ];

    // Filter out empty values and "N/A" values
    const visibleFields = fields.filter(field => field.value && field.value !== 'N/A');

    if (visibleFields.length === 0) return null;

    return (
      <div className="info-category">
        <div className="info-category-title">
          <FaHeart className="me-2" />
          Spouse Information
        </div>
        {visibleFields.map((field, index) => (
          <div key={index} className="info-item">
            <strong>{field.label}:</strong> {field.value}
          </div>
        ))}
      </div>
    );
  };

  const renderDocuments = (documents) => {
    const docFields = [
      { label: 'Aadhaar Card', value: documents.aadhaarCard },
      { label: 'PAN Card', value: documents.panCard },
      { label: 'Driving License', value: documents.drivingLicense },
      { label: 'Voter ID', value: documents.voterID },
      { label: 'Birth Certificate', value: documents.birthCertificate },
      { label: 'Health Insurance', value: documents.healthInsurance },
      { label: 'Marriage Certificate', value: documents.marriageCertificate },
      { label: 'Rent Agreement', value: documents.rentAgreement },
      { label: 'Utility Bill', value: documents.utilityBill },
      { label: 'Passport', value: documents.passport }
    ];

    // Filter out empty values and "N/A" values
    const visibleDocs = docFields.filter(doc => doc.value && doc.value !== 'N/A');

    if (visibleDocs.length === 0) return null;

    return (
      <div className="info-category">
        <div className="info-category-title">
          <FaIdCard className="me-2" />
          Documents
        </div>
        {visibleDocs.map((doc, index) => (
          <div key={index} className="info-item">
            <strong>{doc.label}:</strong> {doc.value}
          </div>
        ))}
      </div>
    );
  };

  const renderRelations = (relations) => {
    const relationTypes = [
      { key: 'mother', label: 'Mother' },
      { key: 'father', label: 'Father' },
      { key: 'sibling', label: 'Sibling' },
      { key: 'flatmate', label: 'Flatmate' },
      { key: 'partner', label: 'Partner' },
      { key: 'friend', label: 'Friend' },
      { key: 'boss', label: 'Boss' },
      { key: 'maid', label: 'Maid' },
      { key: 'cook', label: 'Cook' },
      { key: 'driver', label: 'Driver' }
    ];

    const visibleRelations = relationTypes.filter(rel => 
      relations[rel.key] && relations[rel.key].fullName && relations[rel.key].fullName !== 'N/A'
    );

    if (visibleRelations.length === 0) return null;

    return (
      <div className="info-category">
        <div className="info-category-title">
          <FaHeart className="me-2" />
          Relations
        </div>
        {visibleRelations.map((rel, index) => (
          <div key={index} className="info-item">
            <strong>{rel.label}:</strong> {relations[rel.key].fullName}
          </div>
        ))}
      </div>
    );
  };

  const renderPreferences = (preferences) => {
    if (!preferences || preferences.length === 0) return null;

    return (
      <div className="info-category">
        <div className="info-category-title">
          <FaHeart className="me-2" />
          Preferences
        </div>
        {preferences.map((preference, index) => (
          <div key={index} className="info-item">
            • {preference}
          </div>
        ))}
      </div>
    );
  };

  const renderInterests = (interests) => {
    if (!interests || interests.length === 0) return null;

    return (
      <div className="info-category">
        <div className="info-category-title">
          <FaStar className="me-2" />
          Interests & Hobbies
        </div>
        {interests.map((interest, index) => (
          <div key={index} className="info-item">
            • {interest}
          </div>
        ))}
      </div>
    );
  };

  const renderAllFacts = (allFacts) => {
    if (!allFacts || Object.keys(allFacts).length === 0) return null;

    // Filter out fact types that are already displayed in other sections
    const basicInfoTypes = ['name', 'full_name', 'address', 'home_address', 'office_address', 'date_of_birth', 'dob', 'gender', 'blood_group', 'phone_number', 'phone', 'mobile', 'email', 'relationship_status', 'marital_status', 'nationality', 'place_of_birth'];
    const documentTypes = ['aadhaar', 'pan', 'driving_license', 'voter_id', 'passport'];
    const relationTypes = ['spouse_name', 'spouse', 'wife', 'husband', 'mother', 'father', 'sibling', 'flatmate', 'partner', 'friend', 'boss', 'maid', 'cook', 'driver'];
    const financialTypes = ['credit_card_last_digits'];
    const preferenceTypes = []; // Collect all preference-related fact types
    const interestTypes = []; // Collect all interest-related fact types

    // Identify preference and interest fact types
    Object.keys(allFacts).forEach(factType => {
      if (factType.includes('preference')) {
        preferenceTypes.push(factType);
      } else if (factType.includes('interest') || factType.includes('hobby')) {
        interestTypes.push(factType);
      }
    });

    const dynamicFacts = {};
    Object.keys(allFacts).forEach(factType => {
      if (!basicInfoTypes.includes(factType) && 
          !documentTypes.includes(factType) && 
          !relationTypes.includes(factType) && 
          !financialTypes.includes(factType) &&
          !preferenceTypes.includes(factType) &&
          !interestTypes.includes(factType)) {
        dynamicFacts[factType] = allFacts[factType];
      }
    });

    if (Object.keys(dynamicFacts).length === 0) return null;

    return (
      <div className="info-category mt-3">
        <div className="info-category-title">
          <FaStar className="me-2" />
          Additional Information
        </div>
        {Object.entries(dynamicFacts).map(([factType, values]) => (
          <div key={factType} className="mb-2">
            <strong>{factType.split('_').map(word => word.charAt(0).toUpperCase() + word.slice(1)).join(' ')}:</strong>
            <div>
              {values.map((value, index) => (
                <div key={index} className="info-item">
                  • {value}
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
    );
  };

  if (loading) {
    return (
      <div className="info-graph-container">
        <div className="loading-spinner">
          <Spinner animation="border" variant="primary" />
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="info-graph-container">
        <Alert variant="danger">{error}</Alert>
      </div>
    );
  }

  return (
    <div className="info-graph-container">
      <h2 className="info-graph-header">
        <FaUser className="me-3" />
        Information Graph
      </h2>
      
      {userSummaries.length === 0 ? (
        <Alert variant="info" className="text-center">
          No approved information available yet. Process some user data and approve facts to see them here.
        </Alert>
      ) : (
        <Row>
          {userSummaries.map((summary) => (
            <Col lg={12} xl={6} key={summary.userId} className="mb-4">
              <Card className="user-summary-card h-100">
                <Card.Body>
                  <div className="d-flex justify-content-between align-items-center mb-3">
                    <h5 className="user-name-header mb-0">
                      {(summary.basicInfo.fullName && summary.basicInfo.fullName !== 'N/A') ? summary.basicInfo.fullName : 
                       (summary.basicInfo.userName && summary.basicInfo.userName !== 'N/A') ? summary.basicInfo.userName : 
                       summary.userId}
                    </h5>
                    <Badge bg="primary" className="rounded-pill">
                      {summary.stats.totalFacts} facts
                    </Badge>
                  </div>

                  {/* Basic Information */}
                  {renderBasicInformation(summary.basicInfo)}

                  {/* Spouse Information */}
                  {renderSpouseInformation(summary.spouse)}

                  {/* Documents */}
                  {renderDocuments(summary.documents)}

                  {/* Financial Information */}
                  {summary.financial && (
                    <div className="info-category mt-3">
                      <div className="info-category-title">Financial Information</div>
                      {summary.financial.creditCardLastDigits && (
                        <div className="info-item">
                          <span className="info-label">Credit Card Last 4 Digits:</span>
                          <span className="info-value">****{summary.financial.creditCardLastDigits}</span>
                        </div>
                      )}
                    </div>
                  )}

                  {/* Relations */}
                  {renderRelations(summary.relations)}

                  {/* Preferences */}
                  {renderPreferences(summary.preferences)}

                  {/* Interests & Hobbies */}
                  {renderInterests(summary.interests)}

                  {/* All Dynamic Facts */}
                  {renderAllFacts(summary.allFacts)}
                </Card.Body>
              </Card>
            </Col>
          ))}
        </Row>
      )}
    </div>
  );
};

export default InformationGraph;