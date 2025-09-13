import React, { useState, useEffect } from 'react';
import { Card, Table, Button, Spinner, Alert, Badge } from 'react-bootstrap';
import { Link } from 'react-router-dom';
import { FaUser, FaEye } from 'react-icons/fa';
import { memoryAPI } from '../services/api';

const UsersOverview = () => {
  const [users, setUsers] = useState([]);
  const [userSummaries, setUserSummaries] = useState({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    fetchUsersData();
  }, []);

  const fetchUsersData = async () => {
    try {
      setLoading(true);
      const usersResponse = await memoryAPI.getUsers();
      const usersList = usersResponse.data;
      setUsers(usersList);

      // Fetch summary for each user
      const summaries = {};
      for (const userId of usersList) {
        try {
          const summaryResponse = await memoryAPI.getUserSummary(userId);
          summaries[userId] = summaryResponse.data;
        } catch (err) {
          console.error(`Error fetching summary for user ${userId}:`, err);
          summaries[userId] = null;
        }
      }
      setUserSummaries(summaries);
    } catch (err) {
      setError('Failed to load users data');
      console.error('Error fetching users:', err);
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="loading-spinner">
        <Spinner animation="border" role="status">
          <span className="visually-hidden">Loading...</span>
        </Spinner>
      </div>
    );
  }

  if (error) {
    return <Alert variant="danger">{error}</Alert>;
  }

  return (
    <div>
      <div className="d-flex justify-content-between align-items-center mb-4">
        <h1>Users Overview</h1>
        <Button variant="outline-primary" onClick={fetchUsersData}>
          Refresh
        </Button>
      </div>

      <Card>
        <Card.Header>
          <h5 className="mb-0">All Users ({users.length})</h5>
        </Card.Header>
        <Card.Body className="p-0">
          <Table responsive hover className="mb-0">
            <thead className="table-light">
              <tr>
                <th>User ID</th>
                <th>Total Facts</th>
                <th>Approved</th>
                <th>Pending</th>
                <th>Rejected</th>
                <th>Layers</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {users.map((userId) => {
                const summary = userSummaries[userId];
                if (!summary) {
                  return (
                    <tr key={userId}>
                      <td>
                        <FaUser className="me-2" />
                        {userId}
                      </td>
                      <td colSpan="6" className="text-muted">Loading...</td>
                    </tr>
                  );
                }

                const layerCount = Object.keys(summary.layers).length;
                
                return (
                  <tr key={userId}>
                    <td>
                      <FaUser className="me-2" />
                      <strong>{userId}</strong>
                    </td>
                    <td>
                      <Badge bg="primary">{summary.total_nodes}</Badge>
                    </td>
                    <td>
                      <Badge bg="success">{summary.approved_nodes}</Badge>
                    </td>
                    <td>
                      <Badge bg="warning">{summary.pending_nodes}</Badge>
                    </td>
                    <td>
                      <Badge bg="danger">{summary.rejected_nodes}</Badge>
                    </td>
                    <td>
                      <Badge bg="info">{layerCount} layer(s)</Badge>
                    </td>
                    <td>
                      <Button
                        as={Link}
                        to={`/users/${userId}`}
                        variant="outline-primary"
                        size="sm"
                      >
                        <FaEye className="me-1" />
                        View Details
                      </Button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </Table>
        </Card.Body>
      </Card>

      {users.length === 0 && (
        <Alert variant="info" className="mt-3">
          No users found in the system.
        </Alert>
      )}
    </div>
  );
};

export default UsersOverview;