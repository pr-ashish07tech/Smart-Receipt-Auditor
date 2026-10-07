import React, { useState } from 'react';
import axios from 'axios';
import './App.css';

function App() {
  const [file, setFile] = useState(null);
  const [preview, setPreview] = useState(null);
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState(null);
  const [error, setError] = useState('');

  const handleFileChange = (e) => {
    const selectedFile = e.target.files[0];
    if (selectedFile) {
      setFile(selectedFile);
      setPreview(URL.createObjectURL(selectedFile));
      setResult(null);
      setError('');
    }
  };

  const handleAudit = async () => {
    if (!file) {
      setError('Please select a receipt image first.');
      return;
    }
    setLoading(true);
    setError('');

    const formData = new FormData();
    formData.append('receipt', file);

    try {
      const res = await axios.post('http://localhost:5000/api/audit', formData, {
        headers: { 'Content-Type': 'multipart/form-data' },
      });
      if (res.data.success) {
        setResult(res.data.data);
      } else {
        setError('Audit failed to parse response.');
      }
    } catch (err) {
      setError(err.response?.data?.error || 'Server error during audit.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="container">
      <header className="header">
        <h1>Smart Receipt & Invoice Snapshot Auditor</h1>
        <p>AI-Powered Expense Auditing with Gemini Vision</p>
      </header>

      <main className="main-content">
        <section className="upload-section">
          <div className="file-input-wrapper">
            <input type="file" accept="image/*" onChange={handleFileChange} id="receipt-input" />
            <label htmlFor="receipt-input" className="file-label">
              {file ? file.name : 'Choose Receipt / Invoice Image'}
            </label>
          </div>

          {preview && (
            <div className="preview-container">
              <img src={preview} alt="Receipt Preview" className="receipt-preview" />
            </div>
          )}

          <button onClick={handleAudit} disabled={loading} className="audit-btn">
            {loading ? 'Auditing Receipt...' : 'Run Snapshot Audit'}
          </button>

          {error && <p className="error-msg">{error}</p>}
        </section>

        {result && (
          <section className="result-section">
            <h2>Audit Result Report</h2>
            <div className="report-card">
              <p><strong>Vendor:</strong> {result.vendor || 'N/A'}</p>
              <p><strong>Date:</strong> {result.date || 'N/A'}</p>
              <p><strong>Total Amount:</strong> ${result.totalAmount || 0}</p>
              <p><strong>Tax:</strong> ${result.tax || 0}</p>

              <h3>Line Items</h3>
              {result.items && result.items.length > 0 ? (
                <table className="items-table">
                  <thead>
                    <tr>
                      <th>Description</th>
                      <th>Price</th>
                    </tr>
                  </thead>
                  <tbody>
                    {result.items.map((item, idx) => (
                      <tr key={idx}>
                        <td>{item.name}</td>
                        <td>${item.price}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              ) : (
                <p>No individual line items extracted.</p>
              )}
            </div>
          </section>
        )}
      </main>
    </div>
  );
}

export default App;