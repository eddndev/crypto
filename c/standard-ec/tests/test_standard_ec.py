"""Exercise all curves and cross-check the program with the OpenSSL CLI and Python HKDF."""
import base64
import hashlib
import hmac
import json
import os
import subprocess
import tempfile
import unittest
from pathlib import Path

PROGRAM = Path(os.environ.get('STANDARD_EC_PROGRAM',str(Path(__file__).resolve().parents[1] / 'build/standard-ec')))
CURVES = [('P-224',224,112,'sha224'),('P-256',256,128,'sha256'),
          ('P-384',384,192,'sha384'),('P-521',521,256,'sha512')]

def run(*args, code=0):
    result = subprocess.run([str(PROGRAM), *map(str,args)], capture_output=True, text=True)
    assert result.returncode == code, (args, result.returncode, result.stdout, result.stderr)
    return result.stdout

def fields(text):
    return dict(line.split(' = ',1) for line in text.splitlines() if ' = ' in line)

def der_length(size):
    return bytes([size]) if size<128 else bytes([0x81,size])

def encode_signature(path):
    values=fields(path.read_text())
    integers=[]
    for name in ('r','s'):
        n=int(values[name],16)
        b=n.to_bytes(max(1,(n.bit_length()+7)//8),'big')
        if b[0]&128:b=b'\0'+b
        integers.append(b'\x02'+der_length(len(b))+b)
    body=b''.join(integers)
    return b'\x30'+der_length(len(body))+body

def decode_signature(data):
    def item(offset,tag):
        assert data[offset]==tag
        n=data[offset+1];offset+=2
        if n&128:
            count=n&127;n=int.from_bytes(data[offset:offset+count],'big');offset+=count
        return data[offset:offset+n],offset+n
    body,_=item(0,0x30)
    offset=len(data)-len(body)
    r,offset=item(offset,2);s,_=item(offset,2)
    return f'r = {int.from_bytes(r,"big"):X}\ns = {int.from_bytes(s,"big"):X}\n'

class StandardEcTests(unittest.TestCase):
    def setUp(self):
        self.temp=tempfile.TemporaryDirectory()
        self.root=Path(self.temp.name)
        self.message=self.root/'message.bin'
        self.message.write_bytes(bytes(range(256))*40+b'\0Lab 04\xff')
    def tearDown(self):self.temp.cleanup()
    def keys(self,curve,prefix):
        private=self.root/(prefix+' private.pem');public=self.root/(prefix+' public.pem')
        run('keygen',curve,private,public)
        return private,public
    def test_ecdsa_all_curves_and_cli_interoperability(self):
        for curve,bits,strength,digest in CURVES:
            with self.subTest(curve=curve):
                private,public=self.keys(curve,curve)
                signature=self.root/(curve+'.txt');der=self.root/(curve+'.der')
                run('sign',private,self.message,signature)
                self.assertIn('Valid = true',run('verify',public,self.message,signature))
                der.write_bytes(encode_signature(signature))
                check=subprocess.run(['openssl','dgst','-'+digest,'-verify',str(public),
                                      '-signature',str(der),str(self.message)],capture_output=True)
                self.assertEqual(check.returncode,0,check.stderr)
                subprocess.run(['openssl','dgst','-'+digest,'-sign',str(private),
                                '-out',str(der),str(self.message)],check=True)
                signature.write_text(decode_signature(der.read_bytes()))
                self.assertIn('Valid = true',run('verify',public,self.message,signature))
                altered=self.root/'altered.bin';altered.write_bytes(self.message.read_bytes()+b'!')
                self.assertIn('Valid = false',run('verify',public,altered,signature,code=2))
                _,wrong=self.keys(curve,curve+' wrong')
                self.assertIn('Valid = false',run('verify',wrong,self.message,signature,code=2))
                self.assertTrue(private.read_text().startswith('-----BEGIN PRIVATE KEY-----'))
                self.assertTrue(public.read_text().startswith('-----BEGIN PUBLIC KEY-----'))
    def test_ecdh_all_curves_and_independent_kdf(self):
        for curve,bits,_,_ in CURVES:
            with self.subTest(curve=curve):
                alice=self.root/(curve+' alice.pem');bob=self.root/(curve+' bob.pem')
                result=fields(run('ecdh',curve,alice,bob))
                self.assertEqual(result['Agreement'],'true')
                self.assertEqual(result['K_A (SEC1)'],result['K_B (SEC1)'])
                self.assertEqual(result['Z_A (x)'],result['Z_B (x)'])
                self.assertEqual(result['k_A (256 bits)'],result['k_B (256 bits)'])
                z=base64.b64decode(result['Z_A (x)'],validate=True)
                point=base64.b64decode(result['K_A (SEC1)'],validate=True)
                self.assertEqual(len(z),(bits+7)//8)
                self.assertEqual(point[:1],b'\x04')
                self.assertEqual(point[1:1+len(z)],z)
                salt=base64.b64decode(result['Salt'],validate=True)
                prk=hmac.digest(salt,z,'sha256')
                k=hmac.digest(prk,result['Info'].encode()+b'\x01','sha256')
                self.assertEqual(base64.b64decode(result['k_A (256 bits)']),k)
                self.assertEqual(len(k),32)
                for file in (alice,bob):
                    subprocess.run(['openssl','pkey','-pubin','-in',str(file),'-pubcheck',
                                    '-noout'],check=True,capture_output=True)
    def test_ecdh_two_parties_and_cli_interoperability(self):
        for curve,_,_,_ in CURVES:
            a,ap=self.keys(curve,curve+'a');b,bp=self.keys(curve,curve+'b')
            result=fields(run('derive',a,bp))
            salt=self.root/'salt.bin';salt.write_bytes(base64.b64decode(result['Salt']))
            self.assertEqual(result,fields(run('derive',b,ap,salt)))
            prk=hmac.digest(salt.read_bytes(),base64.b64decode(result['Z (x)']),'sha256')
            expected=hmac.digest(prk,result['Info'].encode()+b'\x01','sha256')
            self.assertEqual(base64.b64decode(result['k (256 bits)']),expected)
            self.assertEqual(len(expected),32)
            for bad in [b'',b'X'*31,b'X'*33]:
                salt.write_bytes(bad);run('derive',a,bp,salt,code=1)
            run('derive',a,bp,self.root/'missing-salt.bin',code=1)
            z=subprocess.check_output(['openssl','pkeyutl','-derive','-inkey',str(a),
                                       '-peerkey',str(bp)])
            self.assertEqual(base64.b64decode(result['Z (x)']),z)
        wrong,_=self.keys('P-256','wrongcurve')
        run('derive',wrong,ap,code=1)
    def test_parameters(self):
        for curve,bits,strength,digest in CURVES:
            result=fields(run('parameters',curve))
            nist=json.loads((Path(__file__).with_name('nist-domains.json')).read_text())[curve]
            for name in ('p','a','b','Gx','Gy','n','h'):
                self.assertEqual(int(result[name],16),int(nist[name],16))
            p,a,b,x,y,n,h=[int(result[k],16) for k in ('p','a','b','Gx','Gy','n','h')]
            self.assertEqual(p.bit_length(),bits)
            self.assertEqual(a,p-3)
            self.assertEqual((y*y-x*x*x-a*x-b)%p,0)
            self.assertEqual(h,1)
            self.assertEqual(int(result['Security bits']),strength)
            self.assertEqual(result['Hash'].lower(),digest)
        run('parameters','P-192',code=1)
    def test_bad_inputs_and_preservation(self):
        private,public=self.keys('P-256','valid')
        original=private.read_bytes()
        run('keygen','P-256',private,public,code=1)
        self.assertEqual(original,private.read_bytes())
        run('keygen','P-256',self.root/'same',self.root/'same',code=1)
        run('keygen','P-256',self.root/'new-private',public,code=1)
        self.assertFalse((self.root/'new-private').exists())
        run('sign',private,self.message,self.message,code=1)
        run('sign',public,self.message,self.root/'sig',code=1)
        run('verify',self.root/'missing',self.message,self.root/'missing-sig',code=1)
        signature=self.root/'signature.txt'
        for text in ['','r = ZZ\ns = 1\n','r = -1\ns = 1\n','r = 1\ns = 1\nextra',
                     'r = 1\ns = 1\0','r = '+('A'*140)+'\ns = 1\n']:
            signature.write_text(text)
            run('verify',public,self.message,signature,code=1)
        signature.write_text('r = 0\ns = 1\n')
        run('verify',public,self.message,signature,code=2)
        empty=self.root/'empty';empty.write_bytes(b'')
        signature.unlink();run('sign',private,empty,signature)
        run('verify',public,empty,signature)
        self.assertEqual(original,private.read_bytes())

if __name__=='__main__':unittest.main(verbosity=2)
