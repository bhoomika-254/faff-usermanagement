import React, { useState, useEffect } from 'react';
import { Card, Row, Col, Spinner, Alert, Badge } from 'react-bootstrap';
import { FaUser, FaPhone, FaEnvelope, FaMapMarkerAlt, FaHeart, FaIdCard, FaPlane, FaStar } from 'react-icons/fa';
import { memoryAPI } from '../services/api';

const InformationGraph = () => {
  const [userSummaries, setUserSummaries] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    fetchAcceptedInformation();
  }, []);

  const fetchAcceptedInformation = async () => {
    try {
      setLoading(true);
      setError(null);
      
      // Get all users first
      console.log('Fetching users...');
      const usersResponse = await memoryAPI.getUsers();
      const users = usersResponse.data; // This is already an array of user IDs
      console.log('Users fetched:', users);
      
      if (!users || users.length === 0) {
        setError('No users found in the system');
        return;
      }
      
      const summaries = [];
      
      // For each user, get their accepted information
      for (const userId of users) {
        try {
          console.log(`Fetching memory for user: ${userId}`);
          const memoryResponse = await memoryAPI.getUserMemory(userId);
          const concludedFacts = memoryResponse.data || []; // API returns array directly
          console.log(`Facts for ${userId}:`, concludedFacts);
          
          // Filter only approved facts
          const approvedFacts = concludedFacts.filter(fact => fact.status === 'approved');
          console.log(`Approved facts for ${userId}:`, approvedFacts);
          
          if (approvedFacts.length > 0) {
            const summary = processUserFacts(userId, approvedFacts);
            summaries.push(summary);
          }
        } catch (err) {
          console.error(`Error fetching memory for user ${userId}:`, err);
          // Continue with other users even if one fails
        }
      }
      
      console.log('Final summaries:', summaries);
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
  };

  const processUserFacts = (userId, facts) => {
    const summary = {
      userId,
      basicInfo: {
        userName: '',
        fullName: '',
        homeAddress: '',
        officeAddress: '',
        dob: '',
        gender: '',
        bloodGroup: '',
        mobileNumbers: [],
        relationshipStatus: '',
        nationality: '',
        placeOfBirth: '',
        email: ''
      },
      spouse: {
        fullName: '',
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
        aadhaarCard: '',
        panCard: '',
        drivingLicense: '',
        voterID: '',
        birthCertificate: '',
        healthInsurance: '',
        marriageCertificate: '',
        rentAgreement: '',
        utilityBill: ''
      },
      relations: {
        mother: {},
        father: {},
        sibling: {},
        flatmate: {},
        partner: {},
        friend: {},
        boss: {},
        maid: {},
        cook: {},
        driver: {}
      },
      stats: {
        totalFacts: facts.length,
        layerDistribution: { Layer1: 0, Layer2: 0, Layer3: 0, Layer4: 0 }
      }
    };

    facts.forEach(fact => {
      const layer = fact.layer;
      summary.stats.layerDistribution[layer]++;

      const conclusion = fact.conclusion || '';
      const factType = fact.fact_type || '';
      const rawValue = fact.raw_value || '';
      
      // Debug logging to understand the data structure
      console.log('Processing fact:', {
        factType,
        conclusion,
        rawValue,
        layer
      });
      
      // Basic Information Processing
      if (factType === 'phone' || conclusion.includes('Phone number') || conclusion.includes('mobile')) {
        const phoneMatch = conclusion.match(/(\+?\d[\d\s\-()]+)/) || 
                          (rawValue !== 'N/A' ? rawValue.match(/(\+?\d[\d\s\-()]+)/) : null);
        if (phoneMatch && !summary.basicInfo.mobileNumbers.includes(phoneMatch[1].trim())) {
          summary.basicInfo.mobileNumbers.push(phoneMatch[1].trim());
        }
      }
      
      if (factType === 'email' || conclusion.includes('Email') || conclusion.includes('email')) {
        const emailMatch = conclusion.match(/([a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,})/) || 
                           (rawValue !== 'N/A' ? rawValue.match(/([a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,})/) : null);
        if (emailMatch) summary.basicInfo.email = emailMatch[1];
      }
      
      if (factType === 'address' || conclusion.includes('address') || conclusion.includes('Address')) {
        const addressMatch = conclusion.match(/address of .* is (.+)/i) || 
                            conclusion.match(/Address:?\s*(.+)/i);
        if (addressMatch) {
          const address = addressMatch[1].trim();
          // Don't confuse email with address and filter out "N/A"
          if (!address.includes('@') && address !== 'N/A') {
            if (conclusion.includes('home') || conclusion.includes('Home')) {
              summary.basicInfo.homeAddress = address;
            } else if (conclusion.includes('office') || conclusion.includes('Office')) {
              summary.basicInfo.officeAddress = address;
            } else {
              summary.basicInfo.homeAddress = address;
            }
          }
        }
      }
      
      if (factType === 'name' || conclusion.includes('Full name') || conclusion.includes('Name')) {
        // First try to use raw_value if it's cleaner and not "N/A"
        if (rawValue && rawValue.length > 1 && rawValue !== 'N/A' && !rawValue.includes('Name of')) {
          if (conclusion.includes('Full name') || conclusion.includes('full name')) {
            summary.basicInfo.fullName = rawValue.trim();
          } else {
            summary.basicInfo.userName = rawValue.trim();
          }
        } else {
          // Fall back to parsing conclusion
          const nameMatch = conclusion.match(/Full name of .* is (.+)/i) || 
                           conclusion.match(/Name of .* is (.+)/i) ||
                           conclusion.match(/Name:?\s*(.+)/i);
          if (nameMatch) {
            const name = nameMatch[1].trim();
            // Don't include the conclusion template, just the actual name
            if (!name.includes('Name of') && name.length > 0) {
              if (conclusion.includes('Full name') || conclusion.includes('full name')) {
                summary.basicInfo.fullName = name;
              } else {
                summary.basicInfo.userName = name;
              }
            }
          }
        }
      }
      
      if (factType === 'age' || conclusion.includes('age') || conclusion.includes('Age')) {
        const ageMatch = conclusion.match(/age of .* is (\d+)/i) || rawValue.match(/(\d+)/);
        if (ageMatch) summary.basicInfo.age = ageMatch[1];
      }
      
      if (factType === 'dob' || conclusion.includes('date of birth') || conclusion.includes('DOB')) {
        const dobMatch = conclusion.match(/date of birth of .* is (.+)/i) || 
                        conclusion.match(/DOB:?\s*(.+)/i);
        if (dobMatch) summary.basicInfo.dob = dobMatch[1].trim();
      }
      
      if (factType === 'gender' || conclusion.includes('gender') || conclusion.includes('Gender')) {
        const genderMatch = conclusion.match(/gender of .* is (.+)/i) || 
                           conclusion.match(/Gender:?\s*(.+)/i);
        if (genderMatch) summary.basicInfo.gender = genderMatch[1].trim();
      }
      
      if (factType === 'blood_group' || conclusion.includes('blood group') || conclusion.includes('Blood Group')) {
        const bloodMatch = conclusion.match(/blood group of .* is (.+)/i) || 
                          conclusion.match(/Blood Group:?\s*(.+)/i);
        if (bloodMatch) summary.basicInfo.bloodGroup = bloodMatch[1].trim();
      }
      
      if (factType === 'nationality' || conclusion.includes('nationality') || conclusion.includes('Nationality')) {
        const nationalityMatch = conclusion.match(/nationality of .* is (.+)/i) || 
                                conclusion.match(/Nationality:?\s*(.+)/i);
        if (nationalityMatch) summary.basicInfo.nationality = nationalityMatch[1].trim();
      }
      
      if (factType === 'place_of_birth' || conclusion.includes('place of birth') || conclusion.includes('born in')) {
        const birthPlaceMatch = conclusion.match(/place of birth of .* is (.+)/i) || 
                               conclusion.match(/born in (.+)/i);
        if (birthPlaceMatch) summary.basicInfo.placeOfBirth = birthPlaceMatch[1].trim();
      }

      // Document Processing
      if (factType === 'pan' || conclusion.includes('PAN') || conclusion.includes('pan')) {
        const panMatch = conclusion.match(/PAN.*is ([A-Z0-9]+)/i) || rawValue.match(/([A-Z0-9]{10})/);
        if (panMatch) summary.documents.panCard = panMatch[1];
      }
      
      if (factType === 'aadhaar' || conclusion.includes('Aadhaar') || conclusion.includes('aadhaar')) {
        const aadhaarMatch = conclusion.match(/Aadhaar.*is (\d+)/i) || rawValue.match(/(\d{12})/);
        if (aadhaarMatch) summary.documents.aadhaarCard = aadhaarMatch[1];
      }
      
      if (factType === 'passport' || conclusion.includes('Passport') || conclusion.includes('passport')) {
        const passportMatch = conclusion.match(/Passport.*is ([A-Z0-9]+)/i) || rawValue.match(/([A-Z]\d{7})/);
        if (passportMatch) summary.documents.passport = passportMatch[1];
      }
      
      if (factType === 'driving_license' || conclusion.includes('driving license') || conclusion.includes('DL')) {
        const dlMatch = conclusion.match(/driving license.*is ([A-Z0-9]+)/i) || rawValue.match(/([A-Z0-9]{15})/);
        if (dlMatch) summary.documents.drivingLicense = dlMatch[1];
      }
      
      if (factType === 'voter_id' || conclusion.includes('voter') || conclusion.includes('EPIC')) {
        const voterMatch = conclusion.match(/voter.*is ([A-Z0-9]+)/i) || rawValue.match(/([A-Z]{3}\d{7})/);
        if (voterMatch) summary.documents.voterID = voterMatch[1];
      }

      // Relationship Processing
      if (factType.includes('relationship') || conclusion.includes('relationship') || 
          factType.includes('spouse') || conclusion.includes('spouse') || 
          factType.includes('family') || conclusion.includes('family') ||
          conclusion.includes('wife') || conclusion.includes('husband') ||
          conclusion.includes('mother') || conclusion.includes('father') ||
          conclusion.includes('friend') || conclusion.includes('partner')) {
        
        // First try raw_value if it's cleaner and not just a single letter or "N/A"
        if (rawValue && rawValue.length > 1 && rawValue !== 'N/A' && !rawValue.match(/^[a-z]$/i)) {
          if (factType.includes('spouse') || factType.includes('wife') || factType.includes('husband') || 
              conclusion.includes('wife') || conclusion.includes('husband') || conclusion.includes('spouse')) {
            summary.spouse.fullName = rawValue.trim();
          } else if (factType.includes('partner') || conclusion.includes('partner')) {
            summary.relations.partner.fullName = rawValue.trim();
          } else if (factType.includes('mother') || conclusion.includes('mother')) {
            summary.relations.mother.fullName = rawValue.trim();
          } else if (factType.includes('father') || conclusion.includes('father')) {
            summary.relations.father.fullName = rawValue.trim();
          } else if (factType.includes('friend') || conclusion.includes('friend')) {
            summary.relations.friend.fullName = rawValue.trim();
          }
        } else {
          // Fall back to parsing conclusion with more precise patterns
          const relationshipMatch = conclusion.match(/(wife|husband|spouse) of .* is (.+)/i) ||
                                   conclusion.match(/(mother|father|sibling|friend|partner|boss|driver|cook|maid|flatmate) of .* is (.+)/i) ||
                                   conclusion.match(/(Wife|Husband|Spouse|Mother|Father|Sibling|Friend|Partner|Boss|Driver|Cook|Maid|Flatmate):?\s*(.+)/i) ||
                                   conclusion.match(/(wife|husband|spouse|mother|father|sibling|friend|partner|boss|driver|cook|maid|flatmate)\s*:\s*(.+)/i);
          
          if (relationshipMatch) {
            const relationType = relationshipMatch[1].toLowerCase();
            let relationName = relationshipMatch[2].trim();
            
            // Clean up the name - remove any remaining template text
            relationName = relationName.replace(/^(name of|is)\s*/i, '');
            relationName = relationName.replace(/\s*(of\s+\w+)?$/i, '');
            
            // Only process if we have a valid name (not just single letters, "N/A", or template remnants)
            if (relationName && relationName.length > 1 && relationName !== 'N/A' && !relationName.match(/^[a-z]$/i)) {
              // Map to our structure
              if (relationType === 'wife' || relationType === 'husband' || relationType === 'spouse') {
                summary.spouse.fullName = relationName;
              } else if (summary.relations[relationType]) {
                summary.relations[relationType].fullName = relationName;
              }
            }
          }
        }
      }
      
      // Relationship Status
      if (factType === 'relationship_status' || conclusion.includes('relationship status') || 
          conclusion.includes('marital status') || conclusion.includes('married') || 
          conclusion.includes('single')) {
        const statusMatch = conclusion.match(/relationship status of .* is (.+)/i) || 
                           conclusion.match(/marital status.*is (.+)/i) ||
                           conclusion.match(/(married|single|divorced|widowed)/i);
        if (statusMatch) summary.basicInfo.relationshipStatus = statusMatch[1].trim();
      }
    });

    return summary;
  };

  const renderBasicInformation = (basicInfo) => {
    const fields = [
      { label: 'User Name', value: basicInfo.userName },
      { label: 'Full Name', value: basicInfo.fullName },
      { label: 'Home Address', value: basicInfo.homeAddress },
      { label: 'Office Address', value: basicInfo.officeAddress },
      { label: 'Email', value: basicInfo.email },
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

                  {/* Relations */}
                  {renderRelations(summary.relations)}

                  {/* Layer Distribution */}
                  <div className="info-category mt-3">
                    <div className="info-category-title">Layer Distribution</div>
                    <Row className="text-center">
                      {Object.entries(summary.stats.layerDistribution).map(([layer, count]) => (
                        count > 0 && (
                          <Col key={layer} xs={6} className="mb-2">
                            <Badge className={`layer-badge layer-${layer.slice(-1)}`}>
                              {layer}: {count}
                            </Badge>
                          </Col>
                        )
                      ))}
                    </Row>
                  </div>
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